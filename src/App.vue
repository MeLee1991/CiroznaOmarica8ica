<template>
  <div class="kiosk-container" :class="ui.theme" :style="customCssVars">
    
    <!-- 1. LEFT COLUMN: VICTIMS -->
    <div class="panel">
      <h2>Žrtve</h2>
      <div class="search-wrapper">
        <input v-model="search" type="text" placeholder="🔍 Išči..." class="input-field shadow-input" autocomplete="off" />
      </div>
      
      <div class="quick-add" style="margin-bottom: 25px;">
        <input v-model="newUser.ime" type="text" placeholder="Ime..." class="input-field" autocomplete="new-password" @keyup.enter="addUser" />
        <div class="btn-group-row">
          <button @click="newUser.tip = 'član'" :class="['btn-toggle', { active: newUser.tip === 'član' }]">Član</button>
          <button @click="newUser.tip = 'nečlan'" :class="['btn-toggle', { active: newUser.tip === 'nečlan' }]">Nečlan</button>
        </div>
        <button @click="addUser" class="btn-add-main">+ Dodaj</button>
      </div>

      <div class="list">
        <div v-for="user in sortedUsers" :key="user.id" 
             :class="['user-item', { 'selected-user': activeUser?.id === user.id }]" 
             @click="activeUser = user">
          
          <div class="user-info">
<strong>                        <span :class="['user-badge-static', user.tip === 'član' ? 'badge-clan' : 'badge-neclan']">{{ user.tip === 'član' ? 'Č' : 'N' }}</span>
            {{ user.ime }}</strong>
          </div>

          <div class="user-actions">

            <span v-if="getUserDebt(user.id) > 0" class="debt-warning">{{ getUserDebt(user.id).toFixed(2) }} €</span>
            <button @click.stop="editUser(user)" class="btn-icon">✎</button>
            <!-- <button @click.stop="deleteUser(user)" class="btn-icon btn-del-red">✖</button> -->
          </div>
        </div>
      </div>
      <button class="btn-admin-main" @click="showAdmin = true">⚙️ Admin Panel</button>
    </div>

    <!-- 2. MIDDLE COLUMN: CIROZNA OMARICA -->
    <div class="panel">
      <h2>Cirozna Omarica</h2>
      <div v-for="cat in uniqueCategories" :key="cat" class="cat-section">
        <div class="cat-title-box">
          <h3>{{ cat }}</h3>
        </div>
        <div class="drink-grid" :style="gridStyleConfig">
          <button v-for="d in sortedDrinks.filter(d => d.kategorija === cat)" :key="d.id" 
                  @click="addDrink(d)" 
                  class="btn-drink" 
                  :style="{ backgroundColor: ui.useCatColors ? getCatColor(cat) : ui.btnBgColor }">
            <span class="drink-name">{{ d.ime }}</span>
            <div v-if="!isSpecialTariff" class="drink-price-area">
              <strong>{{ d.cena.toFixed(2) }} €</strong>
              <div v-if="d.cena_clan > 0 && d.cena_clan !== d.cena" class="member-price-tag">Č: {{ d.cena_clan.toFixed(2) }} €</div>
            </div>
            <div v-else class="drink-price-area">
              <strong class="special-price">{{ (d.cena * (1 + (specialTariffModifier / 100))).toFixed(2) }} €</strong>
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- 3. RIGHT COLUMN: TABLES & ORDERS -->
    <div class="panel">
      <div class="header-flex">
        <h2>Mize & Račun</h2>
        <button @click="isSpecialTariff = !isSpecialTariff" :class="['btn-tariff-mode', { 'active-discount': isSpecialTariff }]">
          {{ isSpecialTariff ? 'Globalni % Popust/Podražitev (Aktiven)' : 'Standardni cenik (Člani / Nečlani)' }}
        </button>
      </div>
      
      <div v-for="t in tables" :key="t.id" class="table-card">
        <div class="table-header">
          <h3>Miza {{ t.id }}</h3>
          <span v-if="t.status !== 'prosta'" :class="['badge', t.status === 'pavza' ? 'badge-warn' : 'badge-active']">{{ t.status }}</span>
        </div>
        
        <div v-if="t.status === 'prosta'">
          <select v-model="t.selectedTariff" class="select-field" v-if="!isSpecialTariff || !flatRateActive">
            <option :value="null" disabled>-- Izberi tarifo --</option>
            <option v-for="tar in tariffs" :key="tar.id" :value="tar">{{ tar.kombinacija }} ({{ tar.cena_na_uro }}€/h)</option>
          </select>
          <div v-else class="flat-rate-notice">Velja enotna tarifa: {{ flatRateValue.toFixed(2) }}€/h</div>
          
          <select v-model="t.payer" class="select-field mt-half">
            <option :value="null" disabled>-- Nosilec plačila --</option>
            <option v-for="u in users" :key="u.id" :value="u">{{ u.ime }}</option>
          </select>
          <button @click="startTable(t)" class="btn-start mt-half">Začni igro</button>
        </div>
        
        <div v-else class="timer-section">
          <div class="active-tariff-display">
            {{ (isSpecialTariff && flatRateActive) ? 'Enotna: ' + flatRateValue.toFixed(2) : (t.selectedTariff?.kombinacija + ' (' + t.selectedTariff?.cena_na_uro.toFixed(2) + ')') }} €/h
          </div>

          <div class="timer">{{ formatTime(t.elapsedSeconds) }}</div>
          <div class="current-cost">{{ t.currentCost.toFixed(2) }} €</div>
          <div class="table-controls">
            <button @click="t.status === 'zasedena' ? pauseTable(t) : resumeTable(t)" class="btn-warn">{{ t.status === 'zasedena' ? '⏸' : '▶' }}</button>
            <button @click="stopTable(t)" class="btn-stop">⏹ Zaključi</button>
          </div>
        </div>
      </div>

      <div v-if="activeUser" class="tab-section">
        <h3>Zapitek: {{ activeUser.ime }}</h3>
        <div class="order-list">
          <div v-for="o in userCurrentOrders" :key="o.id" class="order-row">
            <span class="order-name">{{ o.ime }}</span> 
            <span class="order-price-box">
              {{ o.cena.toFixed(2) }} € 
              <button @click="removeOrder(o.id)" class="btn-del-mini" title="Odstrani in vrni v zalogo">✖</button>
            </span>
          </div>
        </div>
        
        <div v-if="userTotalTab > 0" class="tab-actions">
          <button @click="clearTab" class="btn-stop" style="flex: 1;" title="Izbriše vse in vrne artikle v omarico">Pobriši Vse</button>
          <button @click="payTab" class="btn-pay" style="flex: 2; margin-top:0;">Plačaj ({{ userTotalTab.toFixed(2) }} €)</button>
        </div>
      </div>
      <div v-else class="empty-state">Izberi žrtev za prikaz računa.</div>
    </div>

    <!-- ADMIN MODAL WINDOW -->
    <div v-if="showAdmin" class="modal-overlay">
      <div :class="['modal-content', adminAuth ? 'admin-large' : 'auth-small']">
        
        <!-- LOGIN COMPACT -->
        <div v-if="!adminAuth" class="auth-box-compact">
          <h3>Vnesi kodo za sef</h3>
          <input id="fake-user" name="fake-user" type="text" style="display:none;">
          <input v-model="passInput" type="password" id="safecode-input" class="input-field text-center secret-input input-compact" autocomplete="new-password" @keyup.enter="checkPass">
          <div class="auth-buttons-compact">
            <button @click="checkPass" class="btn-start btn-compact-action">Vstopi</button>
            <button @click="closeAdmin" class="btn-stop btn-compact-action">Prekliči</button>
          </div>
        </div>

        <!-- DASHBOARD CONTAINER -->
        <div v-else class="admin-dashboard">
          <div class="admin-tabs">
            <button @click="adminTab = 'artikli'" :class="['tab-btn', { active: adminTab === 'artikli' }]">Urejanje Bifeja</button>
            <button @click="adminTab = 'inventura'" :class="['tab-btn', { active: adminTab === 'inventura' }]">Inventura</button>
            <button @click="adminTab = 'mize'" :class="['tab-btn', { active: adminTab === 'mize' }]">Mize & Tarife</button>
            <button @click="adminTab = 'statistika'" :class="['tab-btn', { active: adminTab === 'statistika' }]">Statistika</button>
            <button @click="adminTab = 'uporabniki'" :class="['tab-btn', { active: adminTab === 'uporabniki' }]">Igralci</button>
            <button @click="adminTab = 'izgled'" :class="['tab-btn', { active: adminTab === 'izgled' }]">Izgled</button>
            <button @click="adminTab = 'baza'" :class="['tab-btn', { active: adminTab === 'baza' }]">Baza</button>
          </div>
          
          <div class="admin-scroll">
            
            <!-- TAB: ITEMS -->
            <div v-if="adminTab === 'artikli'">
              <div v-for="cat in uniqueCategories" :key="cat" class="admin-cat-block">
                <div class="cat-header">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <div class="sort-arrows">
                      <button @click="moveCategory(cat, -1)" class="arrow-btn">▲</button>
                      <button @click="moveCategory(cat, 1)" class="arrow-btn">▼</button>
                    </div>
                    <h3 style="margin: 0;">{{ cat }}</h3>
                  </div>
                  <button @click="deleteCategory(cat)" class="btn-del-mini">✖ Briši kat.</button>
                </div>
                
                <div v-for="d in sortedDrinks.filter(x => x.kategorija === cat)" :key="d.id" class="admin-item">
                  <div class="sort-arrows">
                    <button @click="moveDrink(d, -1)" class="arrow-btn">▲</button>
                    <button @click="moveDrink(d, 1)" class="arrow-btn">▼</button>
                  </div>
                  <input v-model="d.ime" class="input-inline name-input" @change="updateDrink(d)">
                  <div class="price-inputs">
                    <span class="price-label">R:</span><input v-model.number="d.cena" type="number" step="0.1" class="input-inline price-input" @change="updateDrink(d)">
                    <span class="price-label">Č:</span><input v-model.number="d.cena_clan" type="number" step="0.1" class="input-inline price-input" @change="updateDrink(d)">
                  </div>
                  <div class="admin-item-actions"><button @click="deleteDrink(d.id)" class="btn-del-mini">✖</button></div>
                </div>

                <div class="inline-add-row mt-half">
                  <input v-model="newDrinkModels[cat].ime" placeholder="Nov artikel..." class="input-inline name-input" @keyup.enter="submitNewDrink(cat)">
                  <div class="price-inputs">
                    <span class="price-label">R:</span><input v-model.number="newDrinkModels[cat].cena" type="number" step="0.1" class="input-inline price-input" @keyup.enter="submitNewDrink(cat)">
                    <span class="price-label">Č:</span><input v-model.number="newDrinkModels[cat].cena_clan" type="number" step="0.1" class="input-inline price-input" @keyup.enter="submitNewDrink(cat)">
                  </div>
                  <button @click="submitNewDrink(cat)" class="btn-start btn-small" style="font-size: 16px; width: 40px; padding: 6px;">✔</button>
                </div>
              </div>
            </div>

            <!-- TAB: INVENTORY -->
            <div v-if="adminTab === 'inventura'">
               <div v-for="cat in uniqueCategories" :key="cat" class="admin-cat-block">
                <div class="cat-header"><h3>{{ cat }} - Stanje</h3></div>
                <div v-for="d in sortedDrinks.filter(x => x.kategorija === cat)" :key="d.id" class="admin-item" style="gap: 15px; border-bottom: 1px dashed var(--border-color);">
                  <div class="name-input" style="font-weight: bold; flex-grow: 1; text-align: left;">{{ d.ime }}</div>
                  
                  <div class="inventory-controls" style="display: flex; align-items: center; justify-content: flex-end; gap: 15px;">
                    <div style="display: flex; align-items: center; gap: 5px;">
                      <span style="font-size: 11px; color: #888;">Meja:</span>
                      <input v-model.number="d.min_zaloga" type="number" class="input-inline" style="width: 50px; text-align: center;" @change="updateDrink(d)">
                    </div>
                    <div style="display: flex; align-items: center; gap: 5px;">
                      <button @click="adjustStock(d, -1)" class="btn-stock btn-stock-minus">-</button>
                      <input v-model.number="d.zaloga" type="number" :class="['input-inline', 'stock-input-large', { 'low-stock': d.zaloga <= (d.min_zaloga || 0) }]" @change="updateDrink(d)">
                      <button @click="adjustStock(d, 1)" class="btn-stock btn-stock-plus">+</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- TAB: TABLES -->
            <div v-if="adminTab === 'mize'">
              <div class="admin-cat-block">
                <h3>Globalni % Modifier</h3>
                <div class="inline-add-row">
                  <label>Sprememba cen (%): </label>
                  <input v-model.number="specialTariffModifier" type="number" class="input-inline price-input" style="width: 70px;">
                  <span class="currency">%</span>
                </div>
                <hr style="border-color:var(--border-color); margin:15px 0;">
                <div class="inline-add-row">
                  <input type="checkbox" v-model="flatRateActive" style="transform: scale(1.5); margin-right: 10px;">
                  <label>Enotna cena mize v času popusta: </label>
                  <input v-model.number="flatRateValue" type="number" step="0.5" class="input-inline price-input" style="width: 70px;">
                  <span class="currency">€/h</span>
                </div>
              </div>
              <div class="admin-cat-block">
                <h3>Urejanje standardnih tarif miz</h3>
                <div v-for="tar in tariffs" :key="tar.id" class="admin-item">
                  <input v-model="tar.kombinacija" class="input-inline name-input" disabled>
                  <input v-model.number="tar.cena_na_uro" type="number" step="0.5" class="input-inline price-input" style="width: 70px;" @change="updateTariffDB(tar)">
                  <span class="currency">€/h</span>
                </div>
              </div>
              <div class="admin-cat-block">
                <h3 style="text-align: center;">Število miz (Trenutno: {{ tables.length }})</h3>
                <div class="auth-buttons" style="display: flex; gap: 15px; justify-content: center; max-width: 400px; margin: 0 auto;">
                  <button @click="addTable" class="btn-start">➕ Dodaj mizo</button>
                  <button @click="removeTable" class="btn-stop">➖ Odstrani mizo</button>
                </div>
              </div>
            </div>

            <!-- TAB: STATISTICS -->
            <div v-if="adminTab === 'statistika'" class="stats-container-full">
              <div class="stats-grid">
                <div class="stat-card"><h4>Danes</h4><span class="stat-date">{{ getDateLabel('danes') }}</span><div class="stat-value">{{ stats.daily.toFixed(2) }} €</div></div>
                <div class="stat-card"><h4>Ta teden</h4><span class="stat-date">{{ getDateLabel('teden') }}</span><div class="stat-value">{{ stats.weekly.toFixed(2) }} €</div></div>
                <div class="stat-card"><h4>Ta mesec</h4><span class="stat-date">{{ getDateLabel('mesec') }}</span><div class="stat-value">{{ stats.monthly.toFixed(2) }} €</div></div>
                <div class="stat-card"><h4>Letos</h4><span class="stat-date">{{ getDateLabel('leto') }}</span><div class="stat-value">{{ stats.yearly.toFixed(2) }} €</div></div>
              </div>
              
              <div class="admin-cat-block mt-15">
                <h3 style="text-align: center; margin-bottom: 15px;">Časovni filter za analizo podatkov</h3>
                <div class="btn-group-row" style="justify-content: center; margin-bottom: 15px;">
                  <button @click="setFilter('vse')" :class="['btn-toggle', { active: activeFilter === 'vse' }]">Celotna Zgodovina</button>
                  <button @click="setFilter('danes')" :class="['btn-toggle', { active: activeFilter === 'danes' }]">Danes</button>
                  <button @click="setFilter('teden')" :class="['btn-toggle', { active: activeFilter === 'teden' }]">Ta Teden</button>
                  <button @click="setFilter('mesec')" :class="['btn-toggle', { active: activeFilter === 'mesec' }]">Ta Mesec</button>
                </div>
                <div style="display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 10px;">
                  <button @click="selectedYear--" class="btn-small btn-warn">◀</button>
                  <strong style="font-size: 16px;">Leto {{ selectedYear }}</strong>
                  <button @click="selectedYear++" class="btn-small btn-warn">▶</button>
                </div>
                <div class="btn-group-row" style="flex-wrap: wrap; justify-content: center; gap: 5px;">
                  <button v-for="(m, i) in monthsList" :key="i"
                          @click="setMonthFilter(i)"
                          :class="['btn-toggle', 'btn-small', { active: activeFilter === 'custom_month' && selectedMonth === i }]"
                          style="flex: 0 0 14%; padding: 8px 0; font-size: 12px;">
                    {{ m }}
                  </button>
                </div>
              </div>

              <div class="chart-box mt-15">
                <h3>Promet po dnevih v tednu ({{ currentFilterLabel }})</h3>
                <div class="css-chart">
                  <div v-for="day in weekdayChartData" :key="day.name" class="bar-col">
                    <div class="bar-fill" :style="{ height: day.height + '%' }">
                      <span class="bar-amount">{{ day.amount.toFixed(1) }}€</span>
                    </div>
                    <span class="bar-label">{{ day.name }}</span>
                  </div>
                </div>
              </div>

              <div class="stats-grid mt-15">
                <div class="admin-cat-block" style="margin-bottom:0; max-height: 350px; overflow-y: auto;">
                  <h3>Top Žrtve ({{ currentFilterLabel }})</h3>
                  <table class="stat-table">
                    <thead><tr><th style="text-align: left;">Ime</th><th style="text-align: right;">Znesek (€)</th></tr></thead>
                    <tbody>
                      <tr v-for="p in topDrunks" :key="p.ime">
                        <td style="text-align: left;">{{ p.ime }}</td>
                        <td style="text-align: right;">{{ p.znesek.toFixed(2) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div class="admin-cat-block" style="margin-bottom:0; max-height: 350px; overflow-y: auto;">
                  <h3>Najbolj Prodano ({{ currentFilterLabel }})</h3>
                  <table class="stat-table">
                    <thead><tr><th style="text-align: left;">Artikel</th><th style="text-align: right;">Količina</th></tr></thead>
                    <tbody>
                      <tr v-for="a in topArticles" :key="a.ime">
                        <td style="text-align: left;">{{ a.ime }}</td>
                        <td style="text-align: right;">{{ a.kolicina }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- TAB: PLAYERS -->
            <div v-if="adminTab === 'uporabniki'">
              <div class="admin-cat-block">
                <h3>Upravljanje registriranih igralcev</h3>
                <table class="stat-table" style="margin-top:15px; width: 100%;">
                  <thead>
                    <tr>
                      <th style="text-align: left;">Ime</th>
                      <th style="text-align: right;">Status (Preklopi)</th>
                      <th style="text-align: right;">Trenutni Dolg</th>
                      <th style="text-align: right;">Akcije</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="u in users" :key="u.id">
                      <td style="text-align: left; padding: 4px 8px;"><strong>{{ u.ime }}</strong></td>
                      <td style="text-align: right; padding: 4px 8px;">
                        <button @click="toggleUserStatus(u)" :class="['btn-small', u.tip === 'član' ? 'btn-start' : 'btn-warn']" style="padding:4px 12px; font-weight:bold; width: 100px;">
                          {{ u.tip === 'član' ? 'Član (Č)' : 'Nečlan (N)' }}
                        </button>
                      </td>
                      <td style="text-align: right; padding: 4px 8px;" :style="{ color: getUserDebt(u.id) > 0 ? '#ff5252' : 'inherit', fontWeight: 'bold' }">{{ getUserDebt(u.id).toFixed(2) }} €</td>
                      <td style="text-align: right; padding: 4px 8px;">
                        <button @click="editUser(u)" class="btn-icon">✎</button>
                        <button @click="deleteUser(u)" class="btn-icon btn-del-red">✖</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- TAB: APPEARANCE -->
            <div v-if="adminTab === 'izgled'">
              <div class="admin-cat-block">
                <h3>Globalna Tema</h3>
                <div class="btn-group-row">
                  <button @click="ui.theme = 'dark'" :class="['btn-toggle', { active: ui.theme === 'dark' }]">🌙 Temna</button>
                  <button @click="ui.theme = 'light'" :class="['btn-toggle', { active: ui.theme === 'light' }]">☀️ Svetla</button>
                </div>
                <hr style="border-color:var(--border-color); margin:20px 0;">
                <h3>Konfiguracija Mreže Gumbov (Cirozna Omarica)</h3>
                <div class="inline-add-row mt-15">
                  <label style="width:140px;">Gumbov v vrstici:</label>
                  <select v-model="ui.buttonsPerRow" class="input-inline" style="width:100px;">
                    <option value="1">1 gumb</option>
                    <option value="2">2 gumba</option>
                    <option value="3">3 gumbi</option>
                    <option value="4">4 gumbi</option>
                    <option value="auto">Avtomatsko (Auto)</option>
                  </select>
                </div>
                <div class="inline-add-row mt-half">
                  <label style="width:140px;">Širina gumba:</label>
                  <input v-model="ui.btnWidth" type="text" class="input-inline" style="width:100px;">
                </div>
                <div class="inline-add-row mt-half">
                  <label style="width:140px;">Višina gumba:</label>
                  <input v-model="ui.btnHeight" type="text" class="input-inline" style="width:100px;">
                </div>
                <div class="inline-add-row mt-half">
                  <label style="width:140px;">Velikost pisave:</label>
                  <input v-model="ui.fontSize" type="text" class="input-inline" style="width:100px;">
                </div>
                <button @click="saveUISettings" class="btn-start mt-15">Shrani Nastavitve</button>
              </div>
            </div>

            <!-- TAB: DATABASE BACKUPS -->
            <div v-if="adminTab === 'baza'">
              <div class="admin-cat-block">
                <h3 style="text-align: center; margin-bottom: 20px;">Varnostne Kopije Podatkov</h3>
                
                <div style="margin-bottom: 25px;">
                  <h4 style="margin-bottom: 10px;">Žrtve (Igralci)</h4>
                  <div class="auth-buttons" style="display:flex; gap:10px;">
                    <button @click="exportUsersCSV" class="btn-start btn-blue" style="flex:1;">⬇ Izvozi Žrtve</button>
                    <label class="btn-warn btn-file-upload btn-orange" style="flex:1; margin:0;">
                      ⬆ Uvozi Žrtve <input type="file" accept=".csv" style="display:none" @change="importUsersCSV">
                    </label>
                  </div>
                </div>

                <div style="margin-bottom: 25px;">
                  <h4 style="margin-bottom: 10px;">Cirozna Omarica (Artikli)</h4>
                  <div class="auth-buttons" style="display:flex; gap:10px;">
                    <button @click="exportDrinksCSV" class="btn-start btn-blue" style="flex:1;">⬇ Izvozi Artikle</button>
                    <label class="btn-warn btn-file-upload btn-orange" style="flex:1; margin:0;">
                      ⬆ Uvozi Artikle <input type="file" accept=".csv" style="display:none" @change="importDrinksCSV">
                    </label>
                  </div>
                </div>

                <div>
                  <h4 style="margin-bottom: 10px;">Zgodovina Zapitkov</h4>
                  <div class="auth-buttons" style="display:flex; gap:10px;">
                    <button @click="exportOrdersCSV" class="btn-start btn-blue" style="flex:1;">⬇ Izvozi Zgodovino</button>
                    <label class="btn-warn btn-file-upload btn-orange" style="flex:1; margin:0;">
                      ⬆ Uvozi Zgodovino <input type="file" accept=".csv" style="display:none" @change="importOrdersCSV">
                    </label>
                  </div>
                </div>

              </div>
            </div>

          </div>
          <button @click="closeAdmin" class="btn-close-admin">Zapri Admin Panel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, reactive, watch } from 'vue'
import { supabase } from './supabaseClient'

const ADMIN_PASSWORD = '8'

const users = ref([])
const drinks = ref([])
const tariffs = ref([])
const allOrders = ref([])
const currentOrders = ref([])

const tables = ref([
  { id: 1, status: 'prosta', payer: null, selectedTariff: null, elapsedSeconds: 0, currentCost: 0, interval: null },
  { id: 2, status: 'prosta', payer: null, selectedTariff: null, elapsedSeconds: 0, currentCost: 0, interval: null },
  { id: 3, status: 'prosta', payer: null, selectedTariff: null, elapsedSeconds: 0, currentCost: 0, interval: null }
])

const search = ref('')
const activeUser = ref(null)
const showAdmin = ref(false)
const adminAuth = ref(false)
const adminTab = ref('artikli')
const passInput = ref('')
const newUser = ref({ ime: '', tip: 'nečlan' })
const newCategoryName = ref('')

const isSpecialTariff = ref(false)
const specialTariffModifier = ref(0) 
const flatRateActive = ref(false)
const flatRateValue = ref(5.0)

const activeFilter = ref('vse') 
const selectedMonth = ref(new Date().getMonth())
const selectedYear = ref(new Date().getFullYear())
const monthsList = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Avg', 'Sep', 'Okt', 'Nov', 'Dec']

const setFilter = (f) => { activeFilter.value = f; }
const setMonthFilter = (mIndex) => { selectedMonth.value = mIndex; activeFilter.value = 'custom_month'; }

const newDrinkModels = reactive({})

const defaultUI = { theme: 'dark', buttonsPerRow: '2', btnWidth: '100%', btnHeight: '80px', fontSize: '15px', fontColor: '#ffffff', useCatColors: true, btnBgColor: '#3a3a48' }
const ui = reactive(JSON.parse(localStorage.getItem('ciroznaUI')) || defaultUI)

const saveUISettings = () => { localStorage.setItem('ciroznaUI', JSON.stringify(ui)); alert('Nastavitve shranjene!'); }

const customCssVars = computed(() => { return { '--drink-w': ui.btnWidth, '--drink-h': ui.btnHeight, '--drink-fz': ui.fontSize, '--drink-fc': ui.fontColor } })

const gridStyleConfig = computed(() => {
  if (ui.buttonsPerRow === 'auto') return { gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }
  return { gridTemplateColumns: `repeat(${ui.buttonsPerRow}, 1fr)` }
})

const catColors = ['#2c3e50', '#4a2333', '#234a31', '#4a4023', '#23394a', '#3f234a']
const getCatColor = (catName) => { const index = uniqueCategories.value.indexOf(catName); return catColors[index % catColors.length]; }

// Robust Category Sorting via LocalStorage
const catOrder = reactive(JSON.parse(localStorage.getItem('ciroznaCatOrder')) || [])
watch(catOrder, (newVal) => localStorage.setItem('ciroznaCatOrder', JSON.stringify(newVal)), {deep: true})

const uniqueCategories = computed(() => {
  const dbCats = Array.from(new Set(drinks.value.map(d => d.kategorija)));
  return dbCats.sort((a, b) => {
    let idxA = catOrder.indexOf(a); let idxB = catOrder.indexOf(b);
    if(idxA === -1) idxA = 999; if(idxB === -1) idxB = 999;
    return idxA - idxB;
  });
});

const moveCategory = (cat, direction) => {
  const currentCats = uniqueCategories.value;
  if(catOrder.length === 0 || currentCats.some(c => !catOrder.includes(c))) { catOrder.splice(0, catOrder.length, ...currentCats); }
  const idx = catOrder.indexOf(cat);
  if ((direction === -1 && idx > 0) || (direction === 1 && idx < catOrder.length - 1)) {
     const temp = catOrder[idx]; catOrder[idx] = catOrder[idx + direction]; catOrder[idx + direction] = temp;
     localStorage.setItem('ciroznaCatOrder', JSON.stringify(catOrder));
  }
}

onMounted(async () => {
  const { data: u } = await supabase.from('users').select('*')
  if(u) users.value = u
  const { data: d } = await supabase.from('drinks').select('*').eq('active', true)
  if(d) { drinks.value = d; initCategoryModels() }
  const { data: t } = await supabase.from('tariffs').select('*')
  if(t) tariffs.value = t
  const { data: o } = await supabase.from('orders').select('*')
  if(o) {
    const mappedOrders = o.map(dbOrder => ({
      id: dbOrder.id, userId: dbOrder.user_id, ime: dbOrder.ime_artikla,
      cena: dbOrder.znesek, placano: dbOrder.placano, created_at: dbOrder.timestamp
    }))
    allOrders.value = mappedOrders; currentOrders.value = mappedOrders.filter(order => !order.placano)
  }
})

// Item sorting logic that actually commits array indexes properly
const sortedDrinks = computed(() => [...drinks.value].sort((a, b) => a.vrstni_red - b.vrstni_red || a.id - b.id))

const initCategoryModels = () => {
  uniqueCategories.value.forEach(cat => {
    if (!newDrinkModels[cat]) newDrinkModels[cat] = { ime: '', cena: null, cena_clan: null, zaloga: 0, min_zaloga: 5 }
  })
}

const adjustStock = async (drink, amount) => { drink.zaloga += amount; await updateDrink(drink); }

const moveDrink = async (drink, direction) => {
  let catDrinks = [...drinks.value].filter(d => d.kategorija === drink.kategorija).sort((a,b) => a.vrstni_red - b.vrstni_red || a.id - b.id);
  // Auto-align hierarchy explicitly to combat missing bounds
  catDrinks.forEach((d, i) => d.vrstni_red = i + 1);

  const index = catDrinks.findIndex(d => d.id === drink.id);
  if ((direction === -1 && index > 0) || (direction === 1 && index < catDrinks.length - 1)) {
    const swapDrink = catDrinks[index + direction];
    const temp = drink.vrstni_red; drink.vrstni_red = swapDrink.vrstni_red; swapDrink.vrstni_red = temp;

    const d1 = drinks.value.find(d => d.id === drink.id); if(d1) d1.vrstni_red = drink.vrstni_red;
    const d2 = drinks.value.find(d => d.id === swapDrink.id); if(d2) d2.vrstni_red = swapDrink.vrstni_red;

    await supabase.from('drinks').update({ vrstni_red: drink.vrstni_red }).eq('id', drink.id)
    await supabase.from('drinks').update({ vrstni_red: swapDrink.vrstni_red }).eq('id', swapDrink.id)
  }
}

const addNewCategory = () => {
  if(!newCategoryName.value) return;
  newDrinkModels[newCategoryName.value] = { ime: '', cena: null, cena_clan: null, zaloga: 0, min_zaloga: 5 }
  drinks.value.push({ id: Date.now(), ime: '*(Nova)*', cena: 0, cena_clan: 0, zaloga: 0, min_zaloga: 5, vrstni_red: 999, kategorija: newCategoryName.value, active: true })
  newCategoryName.value = ''
}
const deleteCategory = async (cat) => {
  if(confirm(`Brisanje cele kategorije "${cat}"?`)) {
    const drinksInCat = drinks.value.filter(d => d.kategorija === cat)
    for (let d of drinksInCat) { await supabase.from('drinks').update({ active: false }).eq('id', d.id) }
    drinks.value = drinks.value.filter(d => d.kategorija !== cat)
  }
}
const submitNewDrink = async (cat) => { 
  const model = newDrinkModels[cat]
  if(!model.ime || !model.cena) return;
  const vrstni_red = drinks.value.filter(d => d.kategorija === cat).length + 1
  const insertData = { ime: model.ime, cena: model.cena, cena_clan: model.cena_clan || null, zaloga: model.zaloga || 0, min_zaloga: model.min_zaloga || 5, vrstni_red: vrstni_red, kategorija: cat, active: true }
  const { data } = await supabase.from('drinks').insert([insertData]).select()
  if(data) { drinks.value.push(data[0]); model.ime = ''; model.cena = null; model.cena_clan = null; model.zaloga = 0;}
}
const updateDrink = async (d) => { await supabase.from('drinks').update({ ime: d.ime, cena: d.cena, cena_clan: d.cena_clan, zaloga: d.zaloga, min_zaloga: d.min_zaloga }).eq('id', d.id) }
const deleteDrink = async (id) => { 
  if(confirm('Brišem artikal?')) { 
    await supabase.from('drinks').update({ active: false }).eq('id', id)
    drinks.value = drinks.value.filter(d => d.id !== id)
  } 
}

const downloadCSV = (csvContent, fileName) => {
  const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = fileName; link.click()
}
const exportUsersCSV = () => {
  let csv = "player,status\n"; users.value.forEach(u => csv += `"${u.ime}","${u.tip === 'član' ? 'Č' : 'N'}"\n`)
  downloadCSV(csv, `zrtve_${new Date().toISOString().split('T')[0]}.csv`)
}
const importUsersCSV = async (event) => {
  const file = event.target.files[0]; if (!file) return;
  const text = await file.text()
  const rows = text.split('\n').map(r => r.replace(/\r/g, '').trim()).filter(r => r).slice(1)
  for (let row of rows) {
    const match = row.match(/(?:\"([^\"]*)\"|([^,]+))/g); if (!match) continue
    let ime = match[0].replace(/\"/g, '').trim(), tip = match[1].replace(/\"/g, '').trim().toUpperCase() === 'Č' ? 'član' : 'nečlan'
    if (!users.value.find(u => u.ime.toLowerCase() === ime.toLowerCase())) {
      const { data } = await supabase.from('users').insert([{ ime, tip }]).select()
      if (data) users.value.push(data[0])
    }
  }
  alert(`Uvoz žrtev končan!`); event.target.value = ''
}
const exportDrinksCSV = () => {
  let csv = "ime,cena,cena_clan,kategorija,zaloga,min_zaloga,vrstni_red\n"
  drinks.value.forEach(d => csv += `"${d.ime}",${d.cena},${d.cena_clan || 0},"${d.kategorija}",${d.zaloga || 0},${d.min_zaloga || 5},${d.vrstni_red || 0}\n`)
  downloadCSV(csv, `omarica_${new Date().toISOString().split('T')[0]}.csv`)
}
const importDrinksCSV = async (event) => {
  const file = event.target.files[0]; if (!file) return;
  const text = await file.text()
  const rows = text.split('\n').map(r => r.replace(/\r/g, '').trim()).filter(r => r).slice(1)
  for (let row of rows) {
    const match = row.match(/(?:\"([^\"]*)\"|([^,]+))/g)
    if (!match || match.length < 6) continue
    let ime = match[0].replace(/\"/g, '').trim(), cena = parseFloat(match[1]), cena_clan = parseFloat(match[2])
    let kat = match[3].replace(/\"/g, '').trim(), zaloga = parseInt(match[4]), min_zaloga = parseInt(match[5]), vrstni_red = parseInt(match[6]||0)
    if (!drinks.value.find(d => d.ime.toLowerCase() === ime.toLowerCase())) {
      const { data } = await supabase.from('drinks').insert([{ ime, cena, cena_clan: cena_clan>0?cena_clan:null, kategorija: kat, zaloga, min_zaloga: min_zaloga||5, vrstni_red, active:true }]).select()
      if (data) drinks.value.push(data[0])
    }
  }
  alert(`Uvoz omarice končan!`); event.target.value = ''
}
const exportOrdersCSV = () => {
  let csv = "ime_igralca,artikel,cena,placano,datum\n"
  allOrders.value.forEach(o => {
    const u = users.value.find(x => x.id === o.userId)
    csv += `"${u ? u.ime : 'Neznan'}","${o.ime}",${o.cena},${o.placano ? 'DA' : 'NE'},"${o.created_at}"\n`
  })
  downloadCSV(csv, `zgodovina_${new Date().toISOString().split('T')[0]}.csv`)
}
const importOrdersCSV = async (event) => {
  const file = event.target.files[0]; if (!file) return;
  const text = await file.text()
  const rows = text.split('\n').map(r => r.replace(/\r/g, '').trim()).filter(r => r).slice(1)
  for (let row of rows) {
    const m = row.match(/(?:\"([^\"]*)\"|([^,]+))/g); if (!m) continue
    let u = users.value.find(x => x.ime.toLowerCase() === m[0].replace(/\"/g, '').trim().toLowerCase()); if (!u) continue
    const { data } = await supabase.from('orders').insert([{ user_id: u.id, ime_artikla: m[1].replace(/\"/g, '').trim(), znesek: parseFloat(m[2]), placano: m[3].replace(/\"/g, '').trim().toUpperCase()==='DA', timestamp: m[4].replace(/\"/g, '').trim() }]).select()
    if (data) {
      const o = { id: data[0].id, userId: data[0].user_id, ime: data[0].ime_artikla, cena: data[0].znesek, placano: data[0].placano, created_at: data[0].timestamp }
      allOrders.value.push(o); if(!o.placano) currentOrders.value.push(o)
    }
  }
  alert(`Uvoz zgodovine končan!`); event.target.value = ''
}

const toggleUserStatus = async (user) => {
  const newTip = user.tip === 'član' ? 'nečlan' : 'član'
  const { error } = await supabase.from('users').update({ tip: newTip }).eq('id', user.id)
  if (!error) user.tip = newTip
}
const addUser = async () => { 
  if(!newUser.value.ime) return; 
  const { data } = await supabase.from('users').insert([newUser.value]).select()
  if(data) { users.value = [...users.value, data[0]]; newUser.value.ime = ''; }
}
const deleteUser = async (u) => { 
  if(confirm(`Izbrišem: ${u.ime}?`)) { 
    await supabase.from('users').delete().eq('id', u.id)
    users.value = users.value.filter(us => us.id !== u.id); if (activeUser.value?.id === u.id) activeUser.value = null
  } 
}
const editUser = async (u) => { 
  const n = prompt('Preimenuj žrtev:', u.ime)
  if(n && n.trim() !== '') { await supabase.from('users').update({ ime: n }).eq('id', u.id); u.ime = n; } 
}

const sortedUsers = computed(() => {
  return [...users.value].filter(u => u.ime.toLowerCase().includes(search.value.toLowerCase())).sort((a,b) => {
        const debtA = getUserDebt(a.id), debtB = getUserDebt(b.id)
        if((debtA > 0) !== (debtB > 0)) return debtB > 0 ? 1 : -1 
        return a.ime.localeCompare(b.ime) 
    })
})

const getUserDebt = (id) => currentOrders.value.filter(o => o.userId === id).reduce((sum, o) => sum + o.cena, 0)
const userCurrentOrders = computed(() => activeUser.value ? currentOrders.value.filter(o => o.userId === activeUser.value.id) : [])
const userTotalTab = computed(() => userCurrentOrders.value.reduce((sum, o) => sum + o.cena, 0))

const calculateDrinkPrice = (d, user) => {
  if (isSpecialTariff.value) return d.cena * (1 + (specialTariffModifier.value / 100));
  if (user?.tip === 'član' && d.cena_clan > 0) return d.cena_clan;
  return d.cena;
}

const addDrink = async (d) => { 
  if(!activeUser.value) return alert("Izberi žrtev na levi strani najprej!")
  if(d.zaloga !== null) { d.zaloga--; await supabase.from('drinks').update({ zaloga: d.zaloga }).eq('id', d.id); }
  const finalPrice = calculateDrinkPrice(d, activeUser.value);
  const { data } = await supabase.from('orders').insert([{ user_id: activeUser.value.id, ime_artikla: d.ime, znesek: finalPrice, placano: false }]).select()
  if(data) {
    const o = { id: data[0].id, userId: data[0].user_id, ime: data[0].ime_artikla, cena: data[0].znesek, placano: false, created_at: data[0].timestamp }
    currentOrders.value.push(o); allOrders.value.push(o)
  }
}

const removeOrder = async (id) => { 
  if(!confirm('Zmotno vnešeno? Brišem in vrnem v omarico?')) return;
  const order = allOrders.value.find(o => o.id === id);
  if (order) {
    if (!order.ime.startsWith('Miza')) {
      const drink = drinks.value.find(d => d.ime === order.ime);
      if (drink && drink.zaloga !== null) { drink.zaloga++; await supabase.from('drinks').update({ zaloga: drink.zaloga }).eq('id', drink.id); }
    }
    await supabase.from('orders').delete().eq('id', id)
    currentOrders.value = currentOrders.value.filter(o => o.id !== id); allOrders.value = allOrders.value.filter(o => o.id !== id) 
  }
}

const clearTab = async () => {
  if(!confirm(`Res želiš POBRISATI CELOTEN zapitek za ${activeUser.value.ime}? Pijače se vrnejo v zalogo.`)) return;
  for (const order of userCurrentOrders.value) {
    if (!order.ime.startsWith('Miza')) {
      const drink = drinks.value.find(d => d.ime === order.ime);
      if (drink && drink.zaloga !== null) { drink.zaloga++; await supabase.from('drinks').update({ zaloga: drink.zaloga }).eq('id', drink.id); }
    }
    await supabase.from('orders').delete().eq('id', order.id);
  }
  const orderIds = userCurrentOrders.value.map(o => o.id);
  currentOrders.value = currentOrders.value.filter(o => !orderIds.includes(o.id)); allOrders.value = allOrders.value.filter(o => !orderIds.includes(o.id));
}

const payTab = async () => { 
  if(confirm(`Obračunam ${userTotalTab.value.toFixed(2)} € za ${activeUser.value.ime}?`)) {
    const orderIds = userCurrentOrders.value.map(o => o.id)
    for(let id of orderIds) { await supabase.from('orders').update({ placano: true }).eq('id', id) }
    allOrders.value.forEach(o => { if(orderIds.includes(o.id)) o.placano = true })
    currentOrders.value = currentOrders.value.filter(o => !orderIds.includes(o.id))
  }
}

// --- CALENDAR & STATS LOGIC ---
const getMonday = (d) => { const date = new Date(d); const day = date.getDay(); const diff = date.getDate() - day + (day === 0 ? -6 : 1); date.setDate(diff); date.setHours(4, 30, 0, 0); return date; }
const formatShortDate = (dateObj) => `${dateObj.getDate()}.${dateObj.getMonth()+1}.${dateObj.getFullYear()}`;

const getDateLabel = (type) => {
  const now = new Date();
  if (type === 'danes') {
    const start = new Date(now); if (now.getHours() < 4 || (now.getHours() === 4 && now.getMinutes() < 30)) start.setDate(start.getDate() - 1); start.setHours(4,30,0,0);
    return `${formatShortDate(start)} 04:30 - zdaj`;
  }
  if (type === 'teden') return `Od pon, ${formatShortDate(getMonday(now))}`;
  if (type === 'mesec') return `${now.toLocaleString('sl-SI', { month: 'long' })} ${now.getFullYear()}`;
  if (type === 'leto') return String(now.getFullYear());
  return '';
}

const periodButtons = computed(() => {
  const btns = []; const now = new Date();
  const startThisW = getMonday(now); btns.push({ id: `w_${startThisW.getTime()}`, label: 'Ta teden', start: startThisW.getTime(), end: Infinity });
  const startLastW = new Date(startThisW); startLastW.setDate(startLastW.getDate() - 7); btns.push({ id: `w_${startLastW.getTime()}`, label: 'Prejšnji teden', start: startLastW.getTime(), end: startThisW.getTime() });
  const startThisM = new Date(now.getFullYear(), now.getMonth(), 1, 4, 30, 0); btns.push({ id: `m_${startThisM.getTime()}`, label: 'Ta mesec', start: startThisM.getTime(), end: Infinity });
  let pmYear = now.getFullYear(); let pmMonth = now.getMonth() - 1; if (pmMonth < 0) { pmMonth = 11; pmYear--; }
  const startLastM = new Date(pmYear, pmMonth, 1, 4, 30, 0); btns.push({ id: `m_${startLastM.getTime()}`, label: 'Prejšnji mesec', start: startLastM.getTime(), end: startThisM.getTime() });
  return btns;
});

const currentFilterLabel = computed(() => {
  if (activeFilter.value === 'vse') return 'Celotna zgodovina';
  if (activeFilter.value === 'custom_month') return `${monthsList[selectedMonth.value]} ${selectedYear.value}`;
  const btn = periodButtons.value.find(p => p.id === activeFilter.value);
  return btn ? btn.label : '';
});

const stats = computed(() => {
  const now = new Date()
  const startOfShift = new Date(now); if (now.getHours() < 4 || (now.getHours() === 4 && now.getMinutes() < 30)) startOfShift.setDate(startOfShift.getDate() - 1); startOfShift.setHours(4, 30, 0, 0)
  const startOfWeek = getMonday(now);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 4, 30, 0)
  const startOfYear = new Date(now.getFullYear(), 0, 1)

  let d = 0, w = 0, m = 0, y = 0;
  allOrders.value.filter(o => o.placano).forEach(o => {
    const time = new Date(o.created_at).getTime()
    if (time >= startOfShift.getTime()) d += o.cena
    if (time >= startOfWeek.getTime()) w += o.cena
    if (time >= startOfMonth.getTime()) m += o.cena
    if (time >= startOfYear.getTime()) y += o.cena
  })
  return { daily: d, weekly: w, monthly: m, yearly: y }
})

const filteredOrdersForStats = computed(() => {
  const now = new Date()
  return allOrders.value.filter(o => {
    if (!o.placano) return false;
    const time = new Date(o.created_at);

    if (activeFilter.value === 'vse') return true;
    if (activeFilter.value === 'danes') {
      const start = new Date(now); if (now.getHours() < 4 || (now.getHours() === 4 && now.getMinutes() < 30)) start.setDate(start.getDate() - 1); start.setHours(4, 30, 0, 0);
      return time >= start;
    }
    if (activeFilter.value === 'teden') return time >= getMonday(now);
    if (activeFilter.value === 'mesec') return time >= new Date(now.getFullYear(), now.getMonth(), 1, 4, 30, 0);
    if (activeFilter.value === 'custom_month') {
      const start = new Date(selectedYear.value, selectedMonth.value, 1, 4, 30, 0);
      const end = new Date(selectedYear.value, selectedMonth.value + 1, 1, 4, 30, 0);
      return time >= start && time < end;
    }
    return true;
  });
});

const topDrunks = computed(() => {
  const map = {}
  filteredOrdersForStats.value.forEach(o => {
    if(!map[o.userId]) map[o.userId] = { ime: users.value.find(u=>u.id===o.userId)?.ime || 'Neznan', znesek: 0 }
    map[o.userId].znesek += o.cena
  })
  return Object.values(map).sort((a,b) => b.znesek - a.znesek)
})

const topArticles = computed(() => {
  const map = {}
  filteredOrdersForStats.value.forEach(o => {
    if(o.ime.startsWith('Miza')) return;
    if(!map[o.ime]) map[o.ime] = { ime: o.ime, kolicina: 0 }
    map[o.ime].kolicina += 1
  })
  return Object.values(map).sort((a,b) => b.kolicina - a.kolicina)
})

const weekdayChartData = computed(() => {
  const daysMap = [{ name: 'Pon', amount: 0 }, { name: 'Tor', amount: 0 }, { name: 'Sre', amount: 0 }, { name: 'Čet', amount: 0 }, { name: 'Pet', amount: 0 }, { name: 'Sob', amount: 0 }, { name: 'Ned', amount: 0 }];
  filteredOrdersForStats.value.forEach(o => {
    const date = new Date(o.created_at);
    let dayIndex = date.getDay() - 1; if (dayIndex === -1) dayIndex = 6; 
    daysMap[dayIndex].amount += o.cena;
  });
  const maxAmount = Math.max(...daysMap.map(d => d.amount), 1);
  return daysMap.map(d => ({ ...d, height: (d.amount / maxAmount) * 100 }));
});

const currentTariffs = computed(() => tariffs.value)

const startTable = (t) => { 
  if (!t.payer) { alert('Izberi nosilca plačila!'); return; }
  if (!isSpecialTariff.value || !flatRateActive.value) {
    if (!t.selectedTariff) { alert('Izberi tarifo!'); return; }
  }
  t.status = 'zasedena'
  t.interval = setInterval(() => { 
    t.elapsedSeconds++; 
    const rate = (isSpecialTariff.value && flatRateActive.value) ? flatRateValue.value : t.selectedTariff.cena_na_uro;
    t.currentCost = (rate / 3600) * t.elapsedSeconds 
  }, 1000) 
}

const pauseTable = (t) => { t.status = 'pavza'; clearInterval(t.interval) }
const resumeTable = (t) => { 
  t.status = 'zasedena'
  t.interval = setInterval(() => { 
    t.elapsedSeconds++; 
    const rate = (isSpecialTariff.value && flatRateActive.value) ? flatRateValue.value : t.selectedTariff.cena_na_uro;
    t.currentCost = (rate / 3600) * t.elapsedSeconds 
  }, 1000) 
}

const stopTable = async (t) => { 
  clearInterval(t.interval)
  if(t.currentCost > 0) {
    const rateName = (isSpecialTariff.value && flatRateActive.value) ? 'Enotna tarifa' : t.selectedTariff.kombinacija;
    const newOrder = { user_id: t.payer.id, ime_artikla: `Miza ${t.id} (${rateName})`, znesek: t.currentCost, placano: false }
    const { data } = await supabase.from('orders').insert([newOrder]).select()
    if(data) {
       const o = { id: data[0].id, userId: data[0].user_id, ime: data[0].ime_artikla, cena: data[0].znesek, placano: false, created_at: data[0].timestamp }
       currentOrders.value.push(o); allOrders.value.push(o)
    }
  }
  t.status = 'prosta'; t.payer = null; t.selectedTariff = null; t.elapsedSeconds = 0; t.currentCost = 0; 
}

const addTable = () => { tables.value.push({ id: tables.value.length + 1, status: 'prosta', payer: null, selectedTariff: null, elapsedSeconds: 0, currentCost: 0, interval: null }) }
const removeTable = () => { if(tables.value.length > 1) tables.value.pop() }
const updateTariffDB = async (tar) => { await supabase.from('tariffs').update({ cena_na_uro: tar.cena_na_uro }).eq('id', tar.id) }
const formatTime = (s) => [Math.floor(s/3600), Math.floor((s%3600)/60), s%60].map(v => String(v).padStart(2, '0')).join(':')

const closeAdmin = () => { showAdmin.value = false; adminAuth.value = false; passInput.value = ''; }
const checkPass = () => { if(passInput.value === ADMIN_PASSWORD) adminAuth.value = true; else alert('Napačna koda!'); }
</script>

<style scoped>
:global(html), :global(body) { overscroll-behavior-y: none; overscroll-behavior-x: none; touch-action: pan-x pan-y; margin: 0; padding: 0; overflow: hidden; }

/* THEME VARIABLAS */
.kiosk-container.dark { --bg-color: #121212; --panel-bg: #1e1e24; --text-color: #eaeaea; --border-color: #333333; --input-bg: #2a2a35; --item-bg: #25252d; }
.kiosk-container.light { --bg-color: #e0e0e0; --panel-bg: #ffffff; --text-color: #222222; --border-color: #cccccc; --input-bg: #f5f5f5; --item-bg: #f9f9f9; }

/* GLOBAL & LAYOUT */
.kiosk-container { display: grid; grid-template-columns: 1.1fr 1.2fr 1.1fr; height: 100vh; background: var(--bg-color); color: var(--text-color); padding: 15px; gap: 15px; font-family: sans-serif; box-sizing: border-box; }
.panel { background: var(--panel-bg); padding: 20px; border-radius: 12px; overflow-y: auto; border: 1px solid var(--border-color); }
h2, h3, h4 { color: var(--text-color); margin-top: 0; }
h2 { border-bottom: 2px solid var(--border-color); padding-bottom: 10px; margin-bottom: 15px; text-align: center; }
.header-flex { display: flex; flex-direction: column; gap: 10px; border-bottom: 2px solid var(--border-color); padding-bottom: 15px; margin-bottom: 15px; }
.header-flex h2 { border: none; padding: 0; margin: 0; }

/* INPUTS & BUTTONS */
.input-field { width: 100%; padding: 12px; background: var(--input-bg); color: var(--text-color); border: 1px solid var(--border-color); border-radius: 6px; box-sizing: border-box; margin-bottom: 10px; font-size: 14px; }
.shadow-input { box-shadow: inset 0 2px 4px rgba(0,0,0,0.2); }
.secret-input { -webkit-text-security: disc; } 
.search-wrapper { margin-bottom: 15px; }
.btn-group-row { display: flex; gap: 8px; margin-bottom: 10px; }
.btn-toggle { flex: 1; padding: 10px; background: var(--input-bg); color: var(--text-color); border: 1px solid var(--border-color); cursor: pointer; border-radius: 6px; font-weight: bold; }
.btn-toggle.active { background: #4caf50; border-color: #4caf50; color: white;}
.btn-add-main { width: 100%; padding: 12px; background: #2e7d32; border: none; color: white; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 15px; }
.btn-admin-main { width: 100%; padding: 15px; background: #455a64; border: none; color: white; margin-top: 20px; border-radius: 6px; cursor: pointer; font-weight: bold; }
.btn-tariff-mode { padding: 12px; background: var(--input-bg); color: var(--text-color); border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 14px; transition: background 0.3s; width: 100%;}
.active-discount { background: #d32f2f; border-color: #ff5252; color: white;}

/* RE-ALIGNED PLAYERS (VICTIMS) */
.user-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--item-bg); border-radius: 8px; margin-bottom: 6px; cursor: pointer; border: 1px solid transparent; gap: 10px; }
.is-member { border-left: 6px solid #2980b9; }
.is-guest { border-left: 6px solid #888; }
.selected-user { background: #354a35 !important; border-color: #4caf50; color: white;}
.user-info { text-align: left; flex-grow: 1; min-width: 0; }
.user-info strong { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; font-size: 16px; }

.user-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; justify-content: flex-end; }
.debt-warning { color: #ff5252; font-weight: bold; font-size: 14px; white-space: nowrap; margin-right: 5px; }
.user-badge-static { font-size: 11px; color: white; padding: 2px 5px; border-radius: 3px; font-weight: bold; width: 14px; text-align: center;}
.badge-clan { background: #2980b9; }
.badge-neclan { background: #555; }
.btn-icon { background: var(--border-color); border: none; color: var(--text-color); padding: 6px 10px; cursor: pointer; border-radius: 4px; }
.btn-del-red { background: #c62828; color: white;}

/* DRINKS & CATEGORIES */
.cat-section { margin-bottom: 25px; }
.cat-title-box { background: var(--input-bg); padding: 8px 15px; border-radius: 8px; text-align: center; margin-bottom: 15px; border: 1px solid var(--border-color); }
.cat-title-box h3 { margin: 0; text-transform: uppercase; font-weight: bold; }
.drink-grid { display: grid; gap: 10px; justify-content: center; }
.btn-drink { width: var(--drink-w); height: var(--drink-h); font-size: var(--drink-fz); color: var(--drink-fc); padding: 15px; border: 1px solid rgba(0,0,0,0.15); cursor: pointer; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.15); display: flex; flex-direction: column; justify-content: center; align-items: center;}
.btn-drink:active { transform: scale(0.97); }
.drink-name { margin-bottom: 5px; font-weight: bold;}
.drink-price-area { display: flex; flex-direction: column; align-items: center; }
.special-price { color: #ff9800; font-size: 1.1em;} 
.member-price-tag { font-size: 0.8em; opacity: 0.8; margin-top: 3px; font-weight: normal; }

/* TABLES */
.table-card { background: var(--item-bg); padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid var(--border-color); }
.table-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.table-header h3 { margin: 0; }
.flat-rate-notice { background: #4a2333; color: white; padding: 10px; border-radius: 6px; text-align: center; font-size: 14px; font-weight: bold; }
.badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
.badge-active { background: #f57c00; color: white; }
.badge-warn { background: #fbc02d; color: black; }
.select-field { width: 100%; padding: 10px; background: var(--input-bg); color: var(--text-color); border: 1px solid var(--border-color); border-radius: 6px; font-size: 14px; }
.mt-half { margin-top: 8px; }
.timer-section { text-align: center; }
.active-tariff-display { color: #888; font-size: 13px; background: var(--input-bg); padding: 4px 8px; border-radius: 4px; display: inline-block; margin-bottom: 5px; border: 1px solid var(--border-color); }
.timer { font-size: 32px; font-family: monospace; font-weight: bold; color: #4caf50; margin: 5px 0; }
.current-cost { font-size: 18px; font-weight: bold; margin-bottom: 10px; }
.table-controls { display: flex; gap: 10px; }
.btn-start { background: #2e7d32; color: white; border: none; padding: 12px; width: 100%; cursor: pointer; border-radius: 6px; font-weight: bold; }
.btn-stop { background: #c62828; color: white; border: none; padding: 12px; width: 100%; cursor: pointer; border-radius: 6px; font-weight: bold; }
.btn-warn { background: #f57c00; color: white; border: none; padding: 12px; width: 100%; cursor: pointer; border-radius: 6px; font-weight: bold; }

/* TAB (ZAPITEK) */
.tab-section { margin-top: 25px; padding-top: 15px; border-top: 2px solid var(--border-color); }
.order-list { max-height: 250px; overflow-y: auto; margin-bottom: 15px; }
.order-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 5px; border-bottom: 1px solid var(--border-color); }
.order-price-box { display: flex; align-items: center; gap: 15px; font-weight: bold; }
.btn-del-mini { background: #c62828; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-weight: bold; }
.tab-actions { display: flex; gap: 10px; align-items: stretch; }
.btn-pay { background: #1976d2; color: white; border: none; padding: 15px; cursor: pointer; border-radius: 6px; font-weight: bold; font-size: 16px; }
.empty-state { text-align: center; padding: 30px; color: #888; font-style: italic; }

/* ADMIN MODAL WINDOW */
.modal-overlay { position: fixed; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.85); display: flex; justify-content: center; align-items: center; z-index: 1000; }
.modal-content { background: var(--panel-bg); border: 1px solid var(--border-color); padding: 35px; border-radius: 12px; }
.admin-large { width: 780px; }
.auth-small { width: 330px !important; padding: 20px !important; border-radius: 10px; }

/* COMPACT AUTH DIALOG */
.auth-box-compact h3 { text-align: center; margin-bottom: 12px; font-size: 16px; color: var(--text-color); margin-top: 0;}
.input-compact { padding: 8px 10px !important; font-size: 15px !important; margin-bottom: 12px !important; letter-spacing: 4px; }
.auth-buttons-compact { display: flex; gap: 8px; }
.btn-compact-action { padding: 8px !important; font-size: 13px !important; border-radius: 4px !important; flex: 1; font-weight: bold; cursor: pointer; border: none; color: white;}

/* ADMIN INSIDE */
.admin-tabs { display: flex; gap: 5px; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px; flex-wrap: wrap;}
.tab-btn { background: transparent; color: #888; border: none; font-size: 14px; cursor: pointer; font-weight: bold; padding: 5px 10px; }
.tab-btn.active { color: #4caf50; border-bottom: 2px solid #4caf50; }
.admin-scroll { max-height: 65vh; overflow-y: auto; padding-right: 10px; }
.admin-cat-block { margin-bottom: 20px; background: var(--item-bg); padding: 15px; border-radius: 8px; border-left: 4px solid #4caf50; }
.cat-header { display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 5px; margin-bottom: 10px; align-items: center;}

.admin-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px dashed var(--border-color); }
.input-inline { background: var(--input-bg); color: var(--text-color); border: 1px solid var(--border-color); padding: 6px; border-radius: 4px; font-size: 13px;}
.name-input { flex-grow: 1; margin-right: 10px; }
.price-input { width: 50px; text-align: right; }
.price-inputs { display: flex; gap: 5px; align-items: center;}
.price-label { font-size: 11px; color: #888; margin-left: 5px; }
.currency { margin: 0 5px 0 2px; color: #888; }
.admin-item-actions { display: flex; gap: 5px; margin-left: 10px;}
.sort-arrows { display: flex; flex-direction: column; gap: 2px; margin-right: 10px; }
.arrow-btn { background: var(--border-color); border: none; color: var(--text-color); font-size: 10px; cursor: pointer; padding: 2px 4px; border-radius: 2px; }
.arrow-btn:hover { background: #4caf50; color: white; }
.inline-add-row { display: flex; align-items: center; gap: 10px; background: var(--input-bg); padding: 10px; border-radius: 6px; }
.btn-small { padding: 6px 12px; width: auto; }
.add-drink-box { background: var(--item-bg); padding: 15px; border-radius: 8px; margin-top: 20px; border: 1px dashed #888; }
.add-drink-row { display: flex; gap: 10px; align-items: center; }
.mb-0 { margin-bottom: 0 !important; }
.btn-close-admin { width: 100%; padding: 12px; background: var(--border-color); color: var(--text-color); border: none; border-radius: 6px; margin-top: 20px; cursor: pointer; font-weight: bold; }

/* BAZA BUTTONS */
.db-section { margin-bottom: 25px; }
.db-section h4 { margin-bottom: 10px; }
.btn-blue { background-color: #1976d2 !important; }
.btn-orange { background-color: #f57c00 !important; }

/* INVENTURA */
.btn-stock { background: var(--border-color); color: var(--text-color); border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-weight: bold; }
.btn-stock-minus { background: #c62828; color: white;}
.btn-stock-plus { background: #2e7d32; color: white;}
.stock-input-large { width: 60px; text-align: center; font-weight: bold; font-size: 16px; }
.low-stock { background-color: rgba(255, 82, 82, 0.2); border-color: #ff5252; color: #ff5252;}

/* STATISTIKA & GRAFI */
.stats-container-full { display: flex; flex-direction: column; gap: 20px; }
.stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
.mt-15 { margin-top: 15px; }
.stat-card { background: var(--item-bg); padding: 20px; border-radius: 8px; text-align: center; border: 1px solid var(--border-color); }
.stat-card h4 { margin: 0 0 5px 0; color: #888; text-transform: uppercase; font-size: 12px; }
.stat-date { display: block; font-size: 11px; color: #666; margin-bottom: 10px; }
.stat-value { font-size: 24px; font-weight: bold; color: #4caf50; }
.stat-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
.stat-table th { padding: 4px 8px; border-bottom: 1px solid var(--border-color); color: #888; font-size: 12px; text-align: left;}
.stat-table td { padding: 4px 8px; border-bottom: 1px dashed var(--border-color); font-size: 14px; color: var(--text-color);}
.stat-table tr:hover td { background: rgba(0,0,0,0.2); }

.chart-box { background: var(--item-bg); padding: 20px; border-radius: 8px; border: 1px solid var(--border-color); }
.css-chart { display: flex; align-items: flex-end; justify-content: space-around; height: 160px; margin-top: 20px; border-bottom: 1px solid #555; padding-bottom: 10px; }
.bar-col { display: flex; flex-direction: column; align-items: center; width: 10%; height: 100%; justify-content: flex-end; }
.bar-fill { background: #4caf50; width: 100%; border-radius: 4px 4px 0 0; min-height: 4%; display: flex; align-items: flex-start; justify-content: center; position: relative; transition: height 0.4s ease; }
.bar-amount { position: absolute; top: -20px; font-size: 11px; color: #ccc; font-weight: bold; }
.bar-label { margin-top: 5px; font-size: 12px; color: #aaa; font-weight: bold; }

.btn-file-upload { cursor: pointer; text-align:center; padding: 12px; border-radius:6px; font-weight:bold; color: white; display: inline-block;}
</style>