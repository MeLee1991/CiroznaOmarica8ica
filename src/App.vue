<template>
  <div class="kiosk-container" :class="ui.theme" :style="customCssVars">
    <div v-if="dbError" class="db-error-banner">
      <strong>Baza trenutno ni dosegljiva.</strong>
      <span>{{ dbError }}</span>
      <button @click="loadInitialData" :disabled="dbLoading">{{ dbLoading ? 'Preverjam...' : 'Poskusi znova' }}</button>
    </div>
    
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

            <span v-if="getUserDebt(user.id) !== 0" :class="getUserDebt(user.id) > 0 ? 'debt-warning' : 'credit-warning'">{{ getUserDebt(user.id).toFixed(2) }} €</span>
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
            <option v-for="tar in currentTariffs" :key="tar.id" :value="tar">{{ tar.kombinacija }} ({{ tar.cena_na_uro }}€/h)</option>
          </select>
          <div v-else class="flat-rate-notice">Velja enotna tarifa: {{ flatRateValue.toFixed(2) }}€/h</div>
          
          <select v-model="t.payer" class="select-field mt-half">
            <option :value="null" disabled>-- Nosilec plačila --</option>
            <option v-for="u in alphabeticalUsers" :key="u.id" :value="u">{{ u.ime }}</option>
          </select>
          <button @click="startTable(t)" class="btn-start mt-half">Začni igro</button>
        </div>
        
        <div v-else class="timer-section">
          <div class="active-tariff-display">
            {{ (isSpecialTariff && flatRateActive) ? 'Enotna: ' + flatRateValue.toFixed(2) : (t.selectedTariff?.kombinacija + ' (' + t.selectedTariff?.cena_na_uro.toFixed(2) + ')') }} €/h
          </div>
          <div class="active-payer-display">
            Nosilec: {{ t.lockedPayer?.ime || t.payer?.ime || 'Neznan' }}
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
        <div class="tab-title-row">
          <h3>Zapitek: {{ activeUser.ime }}</h3>
          <button @click="showCustomCharge = !showCustomCharge" :class="['btn-qty', 'custom-charge-toggle', { active: showCustomCharge }]" title="Dodaj ročni artikel ali dobitek">
            {{ showCustomCharge ? '−' : '+' }}
          </button>
        </div>
        <div v-if="showCustomCharge" class="custom-charge-row">
          <input v-model="customCharge.ime" type="text" class="input-inline custom-charge-name" placeholder="Dodaj storitev / artikel..." @keyup.enter="addCustomCharge">
          <input v-model.number="customCharge.cena" type="number" step="0.01" class="input-inline custom-charge-price" placeholder="€" @keyup.enter="addCustomCharge">
          <button @click="addCustomCharge" class="btn-start btn-small">+ Dodaj</button>
        </div>
        <div class="order-list">
          <div v-for="group in groupedCurrentOrders" :key="group.key" class="order-row">
            <div class="order-main">
              <span class="order-name">{{ group.ime }}</span>
              <span class="order-meta">{{ group.quantity }} × {{ group.cena.toFixed(2) }} €</span>
            </div>
            <div class="order-controls">
              <span class="order-total">{{ group.total.toFixed(2) }} €</span>
              <template v-if="group.isDrink">
                <button @click="addOrderGroupItem(group)" class="btn-qty btn-qty-plus" title="Dodaj še eno in odštej iz zaloge">+</button>
                <span class="order-qty">{{ group.quantity }}</span>
                <button @click="removeOrderGroupItem(group)" class="btn-qty btn-qty-minus" title="Odštej eno in vrni v zalogo">−</button>
              </template>
              <button @click="removeOrderGroup(group)" class="btn-del-mini" title="Odstrani vrstico in vrni zalogo">✖</button>
            </div>
          </div>
        </div>
        
        <div v-if="userCurrentOrders.length > 0" class="tab-actions">
          <button @click="clearTab" class="btn-stop" style="flex: 1;" title="Izbriše vse in vrne artikle v omarico">Pobriši Vse</button>
          <button @click="payTab" class="btn-pay" style="flex: 2; margin-top:0;">{{ userTotalTab >= 0 ? 'Plačaj' : 'Zaključi' }} ({{ userTotalTab.toFixed(2) }} €)</button>
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
            <button v-for="tab in adminTabs" :key="tab.id" @click="adminTab = tab.id" :class="['tab-btn', { active: adminTab === tab.id }]">
              {{ adminTabLabels[tab.id] || tab.fallback }}
            </button>
          </div>
          
          <div class="admin-scroll">
            
            <!-- TAB: ITEMS -->
            <div v-if="adminTab === 'artikli'">
              <div class="admin-cat-block add-category-block">
                <h3>Nova kategorija</h3>
                <div class="inline-add-row">
                  <input v-model="newCategoryName" placeholder="Ime kategorije..." class="input-inline name-input" @keyup.enter="addNewCategory">
                  <button @click="addNewCategory" class="btn-start btn-small">Dodaj kategorijo</button>
                </div>
              </div>

              <div v-for="cat in uniqueCategories" :key="cat" class="admin-cat-block">
                <div class="cat-header">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <div class="sort-arrows">
                      <button @click="moveCategory(cat, -1)" class="arrow-btn">▲</button>
                      <button @click="moveCategory(cat, 1)" class="arrow-btn">▼</button>
                    </div>
                    <button @click="toggleCategoryFold('artikli', cat)" class="fold-btn" :title="isCategoryFolded('artikli', cat) ? 'Odpri kategorijo' : 'Zapri kategorijo'">
                      {{ isCategoryFolded('artikli', cat) ? '▸' : '▾' }}
                    </button>
                    <input :value="cat" class="input-inline category-name-input" @change="renameCategory(cat, $event.target.value)">
                  </div>
                  <button @click="deleteCategory(cat)" class="btn-del-mini">✖ Briši kat.</button>
                </div>

                <div v-show="!isCategoryFolded('artikli', cat)">
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
            </div>

            <!-- TAB: INVENTORY -->
            <div v-if="adminTab === 'inventura'">
              <div class="market-summary-grid">
                <div class="market-card"><span>Vrednost zaloge</span><strong>{{ marketSummary.stockValue.toFixed(2) }} €</strong></div>
                <div class="market-card"><span>Možen profit zaloge</span><strong>{{ marketSummary.potentialProfit.toFixed(2) }} €</strong></div>
                <div class="market-card"><span>Profit prodaje</span><strong>{{ marketSummary.realizedProfit.toFixed(2) }} €</strong></div>
              </div>
              <div class="admin-cat-block inventory-sort-panel">
                <span>Razvrsti inventuro:</span>
                <button @click="setInventorySort('ime')" :class="['btn-toggle', { active: inventorySort.key === 'ime' }]">Artikel {{ inventorySortIndicator('ime') }}</button>
                <button @click="setInventorySort('soldQty')" :class="['btn-toggle', { active: inventorySort.key === 'soldQty' }]">Prodano {{ inventorySortIndicator('soldQty') }}</button>
                <button @click="setInventorySort('realizedProfit')" :class="['btn-toggle', { active: inventorySort.key === 'realizedProfit' }]">Profit {{ inventorySortIndicator('realizedProfit') }}</button>
                <button @click="setInventorySort('potentialProfit')" :class="['btn-toggle', { active: inventorySort.key === 'potentialProfit' }]">Zaloga prof. {{ inventorySortIndicator('potentialProfit') }}</button>
              </div>
               <div v-for="cat in sortedInventoryCategories" :key="cat" class="admin-cat-block">
                <div class="cat-header">
                  <h3>{{ cat }} - Stanje</h3>
                  <button @click="toggleCategoryFold('inventura', cat)" class="fold-btn" :title="isCategoryFolded('inventura', cat) ? 'Odpri kategorijo' : 'Zapri kategorijo'">
                    {{ isCategoryFolded('inventura', cat) ? '▸' : '▾' }}
                  </button>
                </div>
                <div v-show="!isCategoryFolded('inventura', cat)">
                <div v-for="d in sortedInventoryDrinks(cat)" :key="d.id" class="inventory-item">
                  <div class="inventory-title">
                    <strong>{{ d.ime }}</strong>
                  </div>

                  <div class="market-line">
                    <span><small>{{ ui.inventorySoldLabel }}</small><strong>{{ getMarketRow(d).soldQty }}</strong></span>
                    <span><small>{{ ui.inventoryProfitLabel }}</small><strong>{{ getMarketRow(d).realizedProfit.toFixed(2) }} €</strong></span>
                    <span><small>{{ ui.inventoryStockProfitLabel }}</small><strong>{{ getMarketRow(d).potentialProfit.toFixed(2) }} €</strong></span>
                  </div>

                  <div class="inventory-controls">
                    <div class="mini-field">
                      <span>{{ ui.inventoryLimitLabel }}</span>
                      <input v-model.number="d.min_zaloga" type="number" min="0" max="999" class="input-inline" @change="updateDrink(d)">
                    </div>
                    <div class="stock-stepper">
                      <button @click="adjustStock(d, -1)" class="btn-stock btn-stock-minus">-</button>
                      <input v-model.number="d.zaloga" type="number" min="0" max="999" :class="['input-inline', 'stock-input-large', { 'low-stock': d.zaloga <= (d.min_zaloga || 0) }]" @change="updateDrink(d)">
                      <button @click="adjustStock(d, 1)" class="btn-stock btn-stock-plus">+</button>
                    </div>
                  </div>

                  <div v-if="purchaseDrafts[d.id]" class="purchase-row">
                    <label>
                      <span>{{ ui.inventoryQtyLabel }}</span>
                      <input v-model.number="purchaseDrafts[d.id].qty" type="number" min="0" class="input-inline">
                    </label>
                    <label>
                      <span>{{ ui.inventoryBuyLabel }}</span>
                      <input v-model.number="purchaseDrafts[d.id].buyPrice" type="number" min="0" step="0.01" class="input-inline">
                    </label>
                    <label>
                      <span>{{ ui.inventorySellLabel }}</span>
                      <input v-model.number="purchaseDrafts[d.id].sellPrice" type="number" min="0" step="0.01" class="input-inline">
                    </label>
                    <button @click="recordPurchase(d)" class="btn-start btn-small purchase-save">{{ ui.inventoryAddBuyLabel }}</button>
                    <button @click="undoLastPurchase(d)" class="btn-warn btn-small purchase-undo" :disabled="!getLastPurchase(d)" :title="getLastPurchase(d) ? 'Razveljavi zadnji nakup' : 'Ni nakupa za razveljaviti'">Undo</button>
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
                <div v-for="tar in currentTariffs" :key="tar.id" class="admin-item">
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
                <div class="stat-card"><h4>Izbrani mesec</h4><span class="stat-date">{{ selectedMonthLabel }}</span><div class="stat-value">{{ stats.selectedMonthly.toFixed(2) }} €</div></div>
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

              <div class="admin-cat-block mt-15 market-table-card">
                <h3>Mini Market ({{ currentFilterLabel }})</h3>
                <table class="stat-table">
                  <thead>
                    <tr>
                      <th class="market-col-name"><button @click="setMarketSort('ime')" class="sort-header">Artikel <span>{{ marketSortIndicator('ime') }}</span></button></th>
                      <th class="market-col-center"><button @click="setMarketSort('soldQty')" class="sort-header">Prodano <span>{{ marketSortIndicator('soldQty') }}</span></button></th>
                      <th class="market-col-center"><button @click="setMarketSort('realizedProfit')" class="sort-header">Profit <span>{{ marketSortIndicator('realizedProfit') }}</span></button></th>
                      <th class="market-col-center"><button @click="setMarketSort('stockValue')" class="sort-header">Zaloga € <span>{{ marketSortIndicator('stockValue') }}</span></button></th>
                      <th class="market-col-center"><button @click="setMarketSort('suggestion')" class="sort-header">Predlog <span>{{ marketSortIndicator('suggestion') }}</span></button></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in marketRows" :key="row.id">
                      <td class="market-col-name">{{ row.ime }}</td>
                      <td class="market-col-center">{{ row.soldQty }}</td>
                      <td class="market-col-center">{{ row.realizedProfit.toFixed(2) }}</td>
                      <td class="market-col-center">{{ row.stockValue.toFixed(2) }}</td>
                      <td class="market-col-center">
                        <span v-if="row.suggestion" :class="['market-pill', row.suggestionClass]">{{ row.suggestion }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

            </div>

            <!-- TAB: PLAYERS -->
            <div v-if="adminTab === 'uporabniki'">
              <div class="admin-cat-block">
                <h3>Upravljanje registriranih igralcev</h3>
                <table class="stat-table" style="margin-top:15px; width: 100%;">
                  <thead>
                    <tr>
                      <th class="player-col-name"><button @click="setPlayerSort('ime')" class="sort-header">Ime <span>{{ playerSortIndicator('ime') }}</span></button></th>
                      <th class="player-col-center"><button @click="setPlayerSort('tip')" class="sort-header">Status <span>{{ playerSortIndicator('tip') }}</span></button></th>
                      <th class="player-col-center"><button @click="setPlayerSort('debt')" class="sort-header">Trenutni dolg <span>{{ playerSortIndicator('debt') }}</span></button></th>
                      <th class="player-col-center"><button @click="setPlayerSort('actions')" class="sort-header">Akcije <span>{{ playerSortIndicator('actions') }}</span></button></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="u in adminUsers" :key="u.id">
                      <td style="text-align: left; padding: 4px 8px;"><strong>{{ u.ime }}</strong></td>
                      <td style="text-align: right; padding: 4px 8px;">
                        <button @click="toggleUserStatus(u)" :class="['btn-small', u.tip === 'član' ? 'btn-start' : 'btn-warn']" style="padding:4px 12px; font-weight:bold; width: 100px;">
                          {{ u.tip === 'član' ? 'Član (Č)' : 'Nečlan (N)' }}
                        </button>
                      </td>
                      <td style="text-align: right; padding: 4px 8px;" :style="{ color: getUserDebt(u.id) > 0 ? '#ff5252' : (getUserDebt(u.id) < 0 ? '#4caf50' : 'inherit'), fontWeight: 'bold' }">{{ getUserDebt(u.id).toFixed(2) }} €</td>
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
                <h3>Imena zavihkov</h3>
                <div class="tab-name-grid">
                  <label v-for="tab in adminTabs" :key="tab.id">
                    <span>{{ tab.fallback }}</span>
                    <input v-model="adminTabLabels[tab.id]" class="input-inline" @change="saveAdminTabLabels">
                  </label>
                </div>
                <hr style="border-color:var(--border-color); margin:20px 0;">
                <h3>Žrtve - seznam</h3>
                <div class="settings-grid">
                  <label>
                    <span>Velikost imen</span>
                    <input v-model="ui.victimFontSize" type="text" class="input-inline">
                  </label>
                  <label class="check-row">
                    <input type="checkbox" v-model="ui.victimBold">
                    <span>Krepka imena</span>
                  </label>
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
                <div class="settings-grid mt-half">
                  <label>
                    <span>Ime pijače</span>
                    <input v-model="ui.drinkNameFontSize" type="text" class="input-inline">
                  </label>
                  <label>
                    <span>Cena / znesek</span>
                    <input v-model="ui.drinkPriceFontSize" type="text" class="input-inline">
                  </label>
                  <label class="check-row">
                    <input type="checkbox" v-model="ui.drinkNameBold">
                    <span>Krepka imena pijač</span>
                  </label>
                </div>
                <hr style="border-color:var(--border-color); margin:20px 0;">
                <h3>Inventura - napisi</h3>
                <div class="settings-grid">
                  <label><span>Kosov</span><input v-model="ui.inventoryQtyLabel" type="text" class="input-inline"></label>
                  <label><span>Nabavna</span><input v-model="ui.inventoryBuyLabel" type="text" class="input-inline"></label>
                  <label><span>Prodajna</span><input v-model="ui.inventorySellLabel" type="text" class="input-inline"></label>
                  <label><span>Meja</span><input v-model="ui.inventoryLimitLabel" type="text" class="input-inline"></label>
                  <label><span>Prodano</span><input v-model="ui.inventorySoldLabel" type="text" class="input-inline"></label>
                  <label><span>Profit</span><input v-model="ui.inventoryProfitLabel" type="text" class="input-inline"></label>
                  <label><span>Zaloga prof.</span><input v-model="ui.inventoryStockProfitLabel" type="text" class="input-inline"></label>
                  <label><span>Gumb nakupa</span><input v-model="ui.inventoryAddBuyLabel" type="text" class="input-inline"></label>
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

                <div style="margin-bottom: 25px;">
                  <h4 style="margin-bottom: 10px;">Zgodovina Zapitkov</h4>
                  <div class="auth-buttons" style="display:flex; gap:10px;">
                    <button @click="exportOrdersCSV" class="btn-start btn-blue" style="flex:1;">⬇ Izvozi Zgodovino</button>
                    <label class="btn-warn btn-file-upload btn-orange" style="flex:1; margin:0;">
                      ⬆ Uvozi Zgodovino <input type="file" accept=".csv" style="display:none" @change="importOrdersCSV">
                    </label>
                  </div>
                </div>

                <div style="margin-bottom: 25px;">
                  <h4 style="margin-bottom: 10px;">Mize & Tarife</h4>
                  <div class="auth-buttons" style="display:flex; gap:10px;">
                    <button @click="exportTariffsCSV" class="btn-start btn-blue" style="flex:1;">⬇ Izvozi Tarife</button>
                    <label class="btn-warn btn-file-upload btn-orange" style="flex:1; margin:0;">
                      ⬆ Uvozi Tarife <input type="file" accept=".csv" style="display:none" @change="importTariffsCSV">
                    </label>
                  </div>
                </div>

                <div style="margin-bottom: 25px;">
                  <h4 style="margin-bottom: 10px;">Nastavitve Izgleda</h4>
                  <div class="auth-buttons" style="display:flex; gap:10px;">
                    <button @click="exportSettingsJSON" class="btn-start btn-blue" style="flex:1;">⬇ Izvozi Nastavitve</button>
                    <label class="btn-warn btn-file-upload btn-orange" style="flex:1; margin:0;">
                      ⬆ Uvozi Nastavitve <input type="file" accept=".json" style="display:none" @change="importSettingsJSON">
                    </label>
                  </div>
                </div>

                <div>
                  <h4 style="margin-bottom: 10px;">Celoten Backup</h4>
                  <div class="auth-buttons" style="display:flex; gap:10px;">
                    <button @click="exportFullBackupJSON" class="btn-start btn-blue" style="flex:1;">⬇ Izvozi Vse</button>
                    <label class="btn-warn btn-file-upload btn-orange" style="flex:1; margin:0;">
                      ⬆ Uvozi Vse <input type="file" accept=".json" style="display:none" @change="importFullBackupJSON">
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
  <div v-if="!showAdmin" class="watermark">
      created by <a href="mailto:deevyezh@gmail.com" class="author-link">Dee-vyezh</a>™
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
const dbError = ref('')
const dbLoading = ref(false)

const tables = ref([
  { id: 1, status: 'prosta', payer: null, lockedPayer: null, selectedTariff: null, elapsedSeconds: 0, currentCost: 0, interval: null },
  { id: 2, status: 'prosta', payer: null, lockedPayer: null, selectedTariff: null, elapsedSeconds: 0, currentCost: 0, interval: null },
  { id: 3, status: 'prosta', payer: null, lockedPayer: null, selectedTariff: null, elapsedSeconds: 0, currentCost: 0, interval: null }
])

const search = ref('')
const activeUser = ref(null)
const showAdmin = ref(false)
const adminAuth = ref(false)
const adminTab = ref('artikli')
const adminTabs = [
  { id: 'artikli', fallback: 'Urejanje Bifeja' },
  { id: 'inventura', fallback: 'Inventura' },
  { id: 'mize', fallback: 'Mize & Tarife' },
  { id: 'statistika', fallback: 'Statistika' },
  { id: 'uporabniki', fallback: 'Igralci' },
  { id: 'izgled', fallback: 'Izgled' },
  { id: 'baza', fallback: 'Baza' }
]
const defaultAdminTabLabels = adminTabs.reduce((acc, tab) => ({ ...acc, [tab.id]: tab.fallback }), {})
const adminTabLabels = reactive({ ...defaultAdminTabLabels, ...(JSON.parse(localStorage.getItem('ciroznaAdminTabs')) || {}) })
const saveAdminTabLabels = () => localStorage.setItem('ciroznaAdminTabs', JSON.stringify(adminTabLabels))
const passInput = ref('')
const newUser = ref({ ime: '', tip: 'nečlan' })
const customCharge = ref({ ime: '', cena: null })
const showCustomCharge = ref(false)
const newCategoryName = ref('')
const defaultTariffs = [
  { id: 1, kombinacija: 'Član + Član', cena_na_uro: 0 },
  { id: 2, kombinacija: 'Član + Nečlan', cena_na_uro: 5 },
  { id: 3, kombinacija: 'Nečlan + Nečlan', cena_na_uro: 10 }
]

const isSpecialTariff = ref(false)
const specialTariffModifier = ref(0) 
const flatRateActive = ref(false)
const flatRateValue = ref(5.0)

const activeFilter = ref('vse') 
const selectedMonth = ref(new Date().getMonth())
const selectedYear = ref(new Date().getFullYear())
const monthsList = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Avg', 'Sep', 'Okt', 'Nov', 'Dec']
const marketSort = ref({ key: 'realizedProfit', dir: 'desc' })
const inventorySort = ref({ key: 'ime', dir: 'asc' })
const playerSort = ref({ key: 'ime', dir: 'asc' })

const setFilter = (f) => { activeFilter.value = f; }
const setMonthFilter = (mIndex) => { selectedMonth.value = mIndex; activeFilter.value = 'custom_month'; }
const setMarketSort = (key) => {
  marketSort.value = {
    key,
    dir: marketSort.value.key === key && marketSort.value.dir === 'desc' ? 'asc' : 'desc'
  }
}
const marketSortIndicator = (key) => {
  if (marketSort.value.key !== key) return ''
  return marketSort.value.dir === 'asc' ? '▲' : '▼'
}
const setInventorySort = (key) => {
  inventorySort.value = {
    key,
    dir: inventorySort.value.key === key && inventorySort.value.dir === 'asc' ? 'desc' : 'asc'
  }
}
const inventorySortIndicator = (key) => {
  if (inventorySort.value.key !== key) return ''
  return inventorySort.value.dir === 'asc' ? '▲' : '▼'
}
const setPlayerSort = (key) => {
  playerSort.value = {
    key,
    dir: playerSort.value.key === key && playerSort.value.dir === 'asc' ? 'desc' : 'asc'
  }
}
const playerSortIndicator = (key) => {
  if (playerSort.value.key !== key) return ''
  return playerSort.value.dir === 'asc' ? '▲' : '▼'
}

const newDrinkModels = reactive({})
const purchaseDrafts = reactive({})
const inventoryBuys = reactive(JSON.parse(localStorage.getItem('ciroznaInventoryBuys')) || [])
watch(inventoryBuys, (newVal) => localStorage.setItem('ciroznaInventoryBuys', JSON.stringify(newVal)), { deep: true })
watch(activeUser, (user) => {
  showCustomCharge.value = false
  if (!user) return
  tables.value.forEach((table) => {
    if (table.status === 'prosta' && !table.lockedPayer) table.payer = user
  })
})

const defaultUI = {
  theme: 'dark',
  buttonsPerRow: '2',
  btnWidth: '100%',
  btnHeight: '80px',
  fontSize: '15px',
  fontColor: '#ffffff',
  useCatColors: true,
  btnBgColor: '#3a3a48',
  victimFontSize: '14px',
  victimBold: true,
  drinkNameFontSize: '15px',
  drinkPriceFontSize: '14px',
  drinkNameBold: true,
  inventoryQtyLabel: 'Kosov',
  inventoryBuyLabel: 'Nabavna',
  inventorySellLabel: 'Prodajna',
  inventoryLimitLabel: 'Meja',
  inventorySoldLabel: 'Prodano',
  inventoryProfitLabel: 'Profit',
  inventoryStockProfitLabel: 'Zaloga prof.',
  inventoryAddBuyLabel: 'Dodaj nakup'
}
const ui = reactive({ ...defaultUI, ...(JSON.parse(localStorage.getItem('ciroznaUI')) || {}) })
if (ui.inventoryQtyLabel === 'Kupi kosov') ui.inventoryQtyLabel = 'Kosov'
if (ui.inventoryBuyLabel === 'Nabavna €/kos') ui.inventoryBuyLabel = 'Nabavna'
if (ui.inventorySellLabel === 'Prodajna €/kos') ui.inventorySellLabel = 'Prodajna'
if (ui.inventoryStockProfitLabel === 'Zaloga profit') ui.inventoryStockProfitLabel = 'Zalog prof.'
if (ui.inventoryStockProfitLabel === 'Zalog prof.') ui.inventoryStockProfitLabel = 'Zaloga prof.'

const saveUISettings = () => { localStorage.setItem('ciroznaUI', JSON.stringify(ui)); alert('Nastavitve shranjene!'); }

const customCssVars = computed(() => {
  return {
    '--drink-w': ui.btnWidth,
    '--drink-h': ui.btnHeight,
    '--drink-fz': ui.fontSize,
    '--drink-fc': ui.fontColor,
    '--victim-fz': ui.victimFontSize,
    '--victim-fw': ui.victimBold ? '700' : '500',
    '--drink-name-fz': ui.drinkNameFontSize,
    '--drink-name-fw': ui.drinkNameBold ? '700' : '500',
    '--drink-price-fz': ui.drinkPriceFontSize
  }
})

const gridStyleConfig = computed(() => {
  if (ui.buttonsPerRow === 'auto') return { gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }
  return { gridTemplateColumns: `repeat(${ui.buttonsPerRow}, minmax(0, 1fr))` }
})

const catColors = ['#2c3e50', '#4a2333', '#234a31', '#4a4023', '#23394a', '#3f234a']
const getCatColor = (catName) => { const index = uniqueCategories.value.indexOf(catName); return catColors[index % catColors.length]; }

// Robust Category Sorting via LocalStorage
const catOrder = reactive(JSON.parse(localStorage.getItem('ciroznaCatOrder')) || [])
watch(catOrder, (newVal) => localStorage.setItem('ciroznaCatOrder', JSON.stringify(newVal)), {deep: true})
const customCategories = reactive(JSON.parse(localStorage.getItem('ciroznaCustomCategories')) || [])
watch(customCategories, (newVal) => localStorage.setItem('ciroznaCustomCategories', JSON.stringify(newVal)), {deep: true})
const foldedCategories = reactive(JSON.parse(localStorage.getItem('ciroznaFoldedCategories')) || [])
watch(foldedCategories, (newVal) => localStorage.setItem('ciroznaFoldedCategories', JSON.stringify(newVal)), {deep: true})

const categoryFoldKey = (scope, cat) => `${scope}:${cat}`
const isCategoryFolded = (scope, cat) => foldedCategories.includes(categoryFoldKey(scope, cat))
const toggleCategoryFold = (scope, cat) => {
  const key = categoryFoldKey(scope, cat)
  const index = foldedCategories.indexOf(key)
  if (index === -1) foldedCategories.push(key)
  else foldedCategories.splice(index, 1)
}

const uniqueCategories = computed(() => {
  const dbCats = Array.from(new Set(drinks.value.map(d => d.kategorija)));
  const cats = Array.from(new Set([...dbCats, ...customCategories])).filter(Boolean)
  return cats.sort((a, b) => {
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

const formatDbError = (table, error) => {
  if (!error) return ''
  const statusText = error.code ? `${error.code}: ` : ''
  return `${table}: ${statusText}${error.message || 'Neznana napaka'}`
}

const toNumber = (value, fallback = 0) => {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

const normalizeUserRow = (user) => ({
  ...user,
  ime: normalizedText(user?.ime || 'Neznan'),
  tip: user?.tip === 'član' ? 'član' : 'nečlan'
})

const normalizeDrinkRow = (drink) => ({
  ...drink,
  ime: normalizedText(drink?.ime || 'Brez imena'),
  cena: toNumber(drink?.cena),
  cena_clan: drink?.cena_clan == null ? null : toNumber(drink.cena_clan),
  kategorija: normalizedText(drink?.kategorija || 'Ostalo'),
  zaloga: toNumber(drink?.zaloga),
  min_zaloga: toNumber(drink?.min_zaloga, 5),
  vrstni_red: toNumber(drink?.vrstni_red),
  active: drink?.active !== false
})

const normalizeTariffRow = (tariff) => ({
  ...tariff,
  kombinacija: normalizedText(tariff?.kombinacija || ''),
  cena_na_uro: toNumber(tariff?.cena_na_uro)
})

const normalizeOrderRow = (dbOrder) => ({
  id: dbOrder.id,
  userId: dbOrder.user_id,
  ime: normalizedText(dbOrder.ime_artikla || 'Brez imena'),
  cena: toNumber(dbOrder.znesek),
  placano: Boolean(dbOrder.placano),
  created_at: dbOrder.timestamp || new Date().toISOString()
})

const loadInitialData = async () => {
  dbLoading.value = true
  dbError.value = ''

  const usersResult = await supabase.from('users').select('*')
  const drinksResult = await supabase.from('drinks').select('*').eq('active', true)
  const tariffsResult = await supabase.from('tariffs').select('*')
  const ordersResult = await supabase.from('orders').select('*')
  const errors = [
    formatDbError('users', usersResult.error),
    formatDbError('drinks', drinksResult.error),
    formatDbError('tariffs', tariffsResult.error),
    formatDbError('orders', ordersResult.error)
  ].filter(Boolean)

  if(usersResult.data) users.value = usersResult.data.map(normalizeUserRow)
  if(drinksResult.data) { drinks.value = drinksResult.data.map(normalizeDrinkRow); initCategoryModels(); initPurchaseModels() }
  if(tariffsResult.data) {
    if (tariffsResult.data.length) tariffs.value = tariffsResult.data.map(normalizeTariffRow)
    else {
      const seededTariffs = []
      for (const tariff of defaultTariffs) {
        const { data } = await supabase.from('tariffs').insert([tariff]).select()
        if (data?.[0]) seededTariffs.push(data[0])
      }
      tariffs.value = seededTariffs.length ? seededTariffs : defaultTariffs
    }
  }
  if(ordersResult.data) {
    const mappedOrders = ordersResult.data.map(normalizeOrderRow)
    allOrders.value = mappedOrders; currentOrders.value = mappedOrders.filter(order => !order.placano)
  }

  if (errors.length) dbError.value = errors.join(' | ')
  dbLoading.value = false
}

onMounted(loadInitialData)

// Item sorting logic that actually commits array indexes properly
const normalizedText = (value) => String(value ?? '')
const sortedDrinks = computed(() => [...drinks.value].sort((a, b) => (Number(a.vrstni_red) || 0) - (Number(b.vrstni_red) || 0) || normalizedText(a.ime).localeCompare(normalizedText(b.ime), 'sl', { sensitivity: 'base' })))
const alphabeticalUsers = computed(() => [...users.value].sort((a, b) => normalizedText(a.ime).localeCompare(normalizedText(b.ime), 'sl', { sensitivity: 'base' })))

const initCategoryModels = () => {
  uniqueCategories.value.forEach(cat => {
    if (!newDrinkModels[cat]) newDrinkModels[cat] = { ime: '', cena: null, cena_clan: null, zaloga: 0, min_zaloga: 5 }
  })
}

const getLatestBuyPrice = (drink) => {
  const last = [...inventoryBuys].reverse().find(buy => buy.drinkId === drink.id || buy.drinkName === drink.ime)
  return last ? Number(last.buyPrice || 0) : 0
}

const initPurchaseModels = () => {
  drinks.value.forEach(d => {
    if (!purchaseDrafts[d.id]) {
      purchaseDrafts[d.id] = { qty: 0, buyPrice: getLatestBuyPrice(d), sellPrice: Number(d.cena || 0) }
    } else {
      purchaseDrafts[d.id].sellPrice = Number(d.cena || 0)
    }
  })
}

const adjustStock = async (drink, amount) => { drink.zaloga += amount; await updateDrink(drink); }

const recordPurchase = async (drink) => {
  const draft = purchaseDrafts[drink.id]
  if (!draft) return
  const qty = Number(draft.qty || 0)
  const buyPrice = Number(draft.buyPrice || 0)
  const sellPrice = Number(draft.sellPrice || drink.cena || 0)
  if (qty <= 0) return alert('Vnesi količino nakupa.')
  if (buyPrice < 0 || sellPrice < 0) return alert('Cena ne sme biti negativna.')

  const stockBefore = Number(drink.zaloga || 0)
  const previousSellPrice = Number(drink.cena || 0)
  drink.zaloga = Number(drink.zaloga || 0) + qty
  drink.cena = sellPrice
  await updateDrink(drink)
  inventoryBuys.push({
    id: `${Date.now()}-${drink.id}`,
    drinkId: drink.id,
    drinkName: drink.ime,
    qty,
    buyPrice,
    sellPrice,
    stockBefore,
    previousSellPrice,
    timestamp: new Date().toISOString()
  })
  draft.qty = 0
}

const getLastPurchase = (drink) => {
  for (let i = inventoryBuys.length - 1; i >= 0; i--) {
    const buy = inventoryBuys[i]
    if (buy.drinkId === drink.id || buy.drinkName === drink.ime) return buy
  }
  return null
}

const undoLastPurchase = async (drink) => {
  const last = getLastPurchase(drink)
  if (!last) return
  if (!confirm(`Razveljavim zadnji nakup za "${drink.ime}" (${last.qty} kosov)?`)) return
  const index = inventoryBuys.findIndex(buy => buy.id === last.id)
  if (index === -1) return

  drink.zaloga = Number.isFinite(Number(last.stockBefore))
    ? Number(last.stockBefore)
    : Math.max(0, Number(drink.zaloga || 0) - Number(last.qty || 0))
  if (Number.isFinite(Number(last.previousSellPrice))) drink.cena = Number(last.previousSellPrice)
  await updateDrink(drink)
  inventoryBuys.splice(index, 1)
  if (purchaseDrafts[drink.id]) {
    purchaseDrafts[drink.id].buyPrice = getLatestBuyPrice(drink)
    purchaseDrafts[drink.id].sellPrice = Number(drink.cena || 0)
  }
}

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
  const categoryName = newCategoryName.value.trim()
  if(!categoryName) return;
  if (uniqueCategories.value.includes(categoryName)) return alert('Kategorija s tem imenom že obstaja.')
  customCategories.push(categoryName)
  catOrder.push(categoryName)
  newDrinkModels[categoryName] = { ime: '', cena: null, cena_clan: null, zaloga: 0, min_zaloga: 5 }
  newCategoryName.value = ''
}

const renameCategory = async (oldName, rawName) => {
  const nextName = rawName.trim()
  if (!nextName || nextName === oldName) return;
  const alreadyExists = drinks.value.some(d => d.kategorija === nextName)
  if (alreadyExists && !confirm(`Kategorija "${nextName}" že obstaja. Združim "${oldName}" z njo?`)) return;

  const { error } = await supabase.from('drinks').update({ kategorija: nextName }).eq('kategorija', oldName)
  if (error) return alert('Preimenovanje kategorije ni uspelo.')

  drinks.value.forEach(d => { if (d.kategorija === oldName) d.kategorija = nextName })
  const customIndex = customCategories.indexOf(oldName)
  if (customIndex !== -1) customCategories[customIndex] = nextName

  const orderIndex = catOrder.indexOf(oldName)
  if (orderIndex !== -1) catOrder[orderIndex] = nextName
  if (!catOrder.includes(nextName)) catOrder.push(nextName)
  const uniqueOrder = [...new Set(catOrder)]
  catOrder.splice(0, catOrder.length, ...uniqueOrder)

  if (newDrinkModels[oldName]) {
    newDrinkModels[nextName] = newDrinkModels[oldName]
    delete newDrinkModels[oldName]
  }
}

const deleteCategory = async (cat) => {
  if(confirm(`Brisanje cele kategorije "${cat}"?`)) {
    const drinksInCat = drinks.value.filter(d => d.kategorija === cat)
    for (let d of drinksInCat) { await supabase.from('drinks').update({ active: false }).eq('id', d.id) }
    drinks.value = drinks.value.filter(d => d.kategorija !== cat)
    const customIndex = customCategories.indexOf(cat)
    if (customIndex !== -1) customCategories.splice(customIndex, 1)
    const orderIndex = catOrder.indexOf(cat)
    if (orderIndex !== -1) catOrder.splice(orderIndex, 1)
  }
}
const submitNewDrink = async (cat) => { 
  const model = newDrinkModels[cat]
  if(!model.ime || !model.cena) return;
  const vrstni_red = drinks.value.filter(d => d.kategorija === cat).length + 1
  const insertData = { ime: model.ime, cena: model.cena, cena_clan: model.cena_clan || null, zaloga: model.zaloga || 0, min_zaloga: model.min_zaloga || 5, vrstni_red: vrstni_red, kategorija: cat, active: true }
  const { data } = await supabase.from('drinks').insert([insertData]).select()
  if(data) { drinks.value.push(data[0]); initPurchaseModels(); model.ime = ''; model.cena = null; model.cena_clan = null; model.zaloga = 0;}
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
const downloadJSON = (content, fileName) => {
  const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json;charset=utf-8;' })
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = fileName; link.click()
}
const readJSONFile = async (event) => {
  const file = event.target.files[0]
  if (!file) return null
  try {
    return JSON.parse(await file.text())
  } catch {
    alert('JSON datoteke ne morem prebrati.')
    return null
  } finally {
    event.target.value = ''
  }
}
const todayStamp = () => new Date().toISOString().split('T')[0]
const buildSettingsBackup = () => ({
  ui: JSON.parse(JSON.stringify(ui)),
  adminTabLabels: JSON.parse(JSON.stringify(adminTabLabels)),
  catOrder: [...catOrder],
  customCategories: [...customCategories],
  foldedCategories: [...foldedCategories],
  inventoryBuys: JSON.parse(JSON.stringify(inventoryBuys)),
  tablesCount: tables.value.length,
  specialTariffModifier: specialTariffModifier.value,
  flatRateActive: flatRateActive.value,
  flatRateValue: flatRateValue.value
})
const applySettingsBackup = (settings = {}) => {
  if (settings.ui) Object.assign(ui, settings.ui)
  if (settings.adminTabLabels) Object.assign(adminTabLabels, settings.adminTabLabels)
  const replaceReactiveArray = (target, value) => {
    if (Array.isArray(value)) target.splice(0, target.length, ...value)
  }
  replaceReactiveArray(catOrder, settings.catOrder)
  replaceReactiveArray(customCategories, settings.customCategories)
  replaceReactiveArray(foldedCategories, settings.foldedCategories)
  replaceReactiveArray(inventoryBuys, settings.inventoryBuys)
  if (Number.isFinite(Number(settings.tablesCount))) {
    const count = Math.max(1, Number(settings.tablesCount))
    tables.value = Array.from({ length: count }, (_, i) => tables.value[i] || { id: i + 1, status: 'prosta', payer: null, selectedTariff: null, elapsedSeconds: 0, currentCost: 0, interval: null })
  }
  if (Number.isFinite(Number(settings.specialTariffModifier))) specialTariffModifier.value = Number(settings.specialTariffModifier)
  if (typeof settings.flatRateActive === 'boolean') flatRateActive.value = settings.flatRateActive
  if (Number.isFinite(Number(settings.flatRateValue))) flatRateValue.value = Number(settings.flatRateValue)
  localStorage.setItem('ciroznaUI', JSON.stringify(ui))
  saveAdminTabLabels()
  localStorage.setItem('ciroznaCatOrder', JSON.stringify(catOrder))
  localStorage.setItem('ciroznaCustomCategories', JSON.stringify(customCategories))
  localStorage.setItem('ciroznaFoldedCategories', JSON.stringify(foldedCategories))
  localStorage.setItem('ciroznaInventoryBuys', JSON.stringify(inventoryBuys))
  initCategoryModels()
  initPurchaseModels()
}
const exportUsersCSV = () => {
  let csv = "player,status\n"; users.value.forEach(u => csv += `"${u.ime}","${u.tip === 'član' ? 'Č' : 'N'}"\n`)
  downloadCSV(csv, `zrtve_${todayStamp()}.csv`)
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
  downloadCSV(csv, `omarica_${todayStamp()}.csv`)
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
  downloadCSV(csv, `zgodovina_${todayStamp()}.csv`)
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
const exportTariffsCSV = () => {
  let csv = "id,kombinacija,cena_na_uro\n"
  tariffs.value.forEach(t => csv += `${t.id},"${t.kombinacija}",${t.cena_na_uro}\n`)
  downloadCSV(csv, `tarife_${todayStamp()}.csv`)
}
const importTariffsCSV = async (event) => {
  const file = event.target.files[0]; if (!file) return;
  const text = await file.text()
  const rows = text.split('\n').map(r => r.replace(/\r/g, '').trim()).filter(r => r).slice(1)
  for (let row of rows) {
    const m = row.match(/(?:\"([^\"]*)\"|([^,]+))/g); if (!m || m.length < 3) continue
    const id = Number(m[0].replace(/\"/g, '').trim())
    const kombinacija = m[1].replace(/\"/g, '').trim()
    const cena_na_uro = Number(m[2].replace(/\"/g, '').trim())
    const existing = tariffs.value.find(t => t.id === id || normalizedText(t.kombinacija).toLowerCase() === kombinacija.toLowerCase())
    if (existing) {
      existing.kombinacija = kombinacija
      existing.cena_na_uro = cena_na_uro
      await supabase.from('tariffs').update({ kombinacija, cena_na_uro }).eq('id', existing.id)
    } else {
      const { data } = await supabase.from('tariffs').insert([{ id, kombinacija, cena_na_uro }]).select()
      if (data) tariffs.value.push(data[0])
    }
  }
  alert('Uvoz tarif končan!'); event.target.value = ''
}
const exportSettingsJSON = () => downloadJSON(buildSettingsBackup(), `nastavitve_${todayStamp()}.json`)
const importSettingsJSON = async (event) => {
  const settings = await readJSONFile(event)
  if (!settings) return
  applySettingsBackup(settings.settings || settings)
  alert('Uvoz nastavitev končan!')
}
const exportFullBackupJSON = async () => {
  const [usersResult, drinksResult, tariffsResult, ordersResult] = await Promise.all([
    supabase.from('users').select('*'),
    supabase.from('drinks').select('*'),
    supabase.from('tariffs').select('*'),
    supabase.from('orders').select('*')
  ])
  const errors = [usersResult.error, drinksResult.error, tariffsResult.error, ordersResult.error].filter(Boolean)
  if (errors.length) return alert('Nekaterih podatkov ne morem izvoziti, ker baza trenutno ne odgovarja.')
  downloadJSON({
    version: 1,
    exported_at: new Date().toISOString(),
    users: usersResult.data || [],
    drinks: drinksResult.data || [],
    tariffs: tariffsResult.data || [],
    orders: ordersResult.data || [],
    settings: buildSettingsBackup()
  }, `cirozna_backup_${todayStamp()}.json`)
}
const normalizeBackupOrder = (order) => ({
  user_id: order.user_id ?? order.userId,
  ime_artikla: order.ime_artikla ?? order.ime,
  znesek: Number(order.znesek ?? order.cena ?? 0),
  placano: Boolean(order.placano),
  timestamp: order.timestamp ?? order.created_at ?? new Date().toISOString()
})
const importFullBackupJSON = async (event) => {
  const backup = await readJSONFile(event)
  if (!backup) return
  if (!confirm('Uvozim celoten backup? Obstoječih enakih imen ne bom podvajal, zgodovina pa se doda samo, če je še ni.')) return

  if (backup.settings) applySettingsBackup(backup.settings)

  const userIdMap = new Map()
  for (const user of backup.users || []) {
    const existingUser = users.value.find(u => String(u.ime).toLowerCase() === String(user.ime).toLowerCase())
    if (existingUser) {
      userIdMap.set(String(user.id), existingUser.id)
    } else {
      const { data } = await supabase.from('users').insert([{ id: user.id, ime: user.ime, tip: user.tip || 'nečlan' }]).select()
      if (data?.[0]) {
        users.value.push(data[0])
        userIdMap.set(String(user.id), data[0].id)
      }
    }
  }

  for (const drink of backup.drinks || []) {
    if (!drinks.value.find(d => String(d.ime).toLowerCase() === String(drink.ime).toLowerCase())) {
      const { data } = await supabase.from('drinks').insert([{ ...drink, active: drink.active !== false }]).select()
      if (data?.[0] && data[0].active !== false) drinks.value.push(data[0])
    }
  }

  for (const tariff of backup.tariffs || []) {
    const existing = tariffs.value.find(t => t.id === tariff.id || String(t.kombinacija).toLowerCase() === String(tariff.kombinacija).toLowerCase())
    if (existing) {
      existing.kombinacija = tariff.kombinacija
      existing.cena_na_uro = Number(tariff.cena_na_uro || 0)
      await supabase.from('tariffs').update({ kombinacija: existing.kombinacija, cena_na_uro: existing.cena_na_uro }).eq('id', existing.id)
    } else {
      const { data } = await supabase.from('tariffs').insert([{ id: tariff.id, kombinacija: tariff.kombinacija, cena_na_uro: Number(tariff.cena_na_uro || 0) }]).select()
      if (data?.[0]) tariffs.value.push(data[0])
    }
  }

  for (const rawOrder of backup.orders || []) {
    const order = normalizeBackupOrder(rawOrder)
    order.user_id = userIdMap.get(String(order.user_id)) ?? order.user_id
    const exists = allOrders.value.some(o => String(o.userId) === String(order.user_id) && o.ime === order.ime_artikla && Number(o.cena) === Number(order.znesek) && o.created_at === order.timestamp)
    if (exists) continue
    const { data } = await supabase.from('orders').insert([order]).select()
    if (data?.[0]) {
      const o = { id: data[0].id, userId: data[0].user_id, ime: data[0].ime_artikla, cena: data[0].znesek, placano: data[0].placano, created_at: data[0].timestamp }
      allOrders.value.push(o); if (!o.placano) currentOrders.value.push(o)
    }
  }
  initCategoryModels()
  initPurchaseModels()
  alert('Uvoz celotnega backupa končan!')
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
  return [...users.value].filter(u => normalizedText(u.ime).toLowerCase().includes(search.value.toLowerCase())).sort((a,b) => {
        const debtA = getUserDebt(a.id), debtB = getUserDebt(b.id)
        if((debtA !== 0) !== (debtB !== 0)) return debtA !== 0 ? -1 : 1
        return normalizedText(a.ime).localeCompare(normalizedText(b.ime), 'sl', { sensitivity: 'base' }) 
    })
})

const getUserDebt = (id) => currentOrders.value.filter(o => o.userId === id).reduce((sum, o) => sum + o.cena, 0)
const adminUsers = computed(() => {
  const direction = playerSort.value.dir === 'asc' ? 1 : -1
  return [...users.value].sort((a, b) => {
    if (playerSort.value.key === 'debt') return (getUserDebt(a.id) - getUserDebt(b.id)) * direction
    if (playerSort.value.key === 'tip') return String(a.tip || '').localeCompare(String(b.tip || ''), 'sl', { sensitivity: 'base' }) * direction
    if (playerSort.value.key === 'actions') return String(a.id || '').localeCompare(String(b.id || ''), 'sl', { numeric: true }) * direction
    return String(a.ime || '').localeCompare(String(b.ime || ''), 'sl', { sensitivity: 'base' }) * direction
  })
})
const userCurrentOrders = computed(() => activeUser.value ? currentOrders.value.filter(o => o.userId === activeUser.value.id) : [])
const userTotalTab = computed(() => userCurrentOrders.value.reduce((sum, o) => sum + o.cena, 0))
const isDrinkOrderName = (name) => drinks.value.some(d => d.ime === name)
const groupedCurrentOrders = computed(() => {
  const groups = new Map()
  userCurrentOrders.value.forEach((order) => {
    const key = `${order.ime}__${Number(order.cena).toFixed(4)}`
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        ime: order.ime,
        cena: order.cena,
        total: 0,
        quantity: 0,
        isDrink: isDrinkOrderName(order.ime),
        orders: []
      })
    }
    const group = groups.get(key)
    group.orders.push(order)
    group.quantity += 1
    group.total += order.cena
  })
  return Array.from(groups.values())
})

const calculateDrinkPrice = (d, user) => {
  if (isSpecialTariff.value) return d.cena * (1 + (specialTariffModifier.value / 100));
  if (user?.tip === 'član' && d.cena_clan > 0) return d.cena_clan;
  return d.cena;
}

const addDrink = async (d, priceOverride = null) => { 
  if(!activeUser.value) return alert("Izberi žrtev na levi strani najprej!")
  if(d.zaloga !== null) { d.zaloga--; await supabase.from('drinks').update({ zaloga: d.zaloga }).eq('id', d.id); }
  const finalPrice = priceOverride ?? calculateDrinkPrice(d, activeUser.value);
  const { data } = await supabase.from('orders').insert([{ user_id: activeUser.value.id, ime_artikla: d.ime, znesek: finalPrice, placano: false }]).select()
  if(data) {
    const o = { id: data[0].id, userId: data[0].user_id, ime: data[0].ime_artikla, cena: data[0].znesek, placano: false, created_at: data[0].timestamp }
    currentOrders.value.push(o); allOrders.value.push(o)
  }
}

const addCustomCharge = async () => {
  if(!activeUser.value) return alert("Izberi žrtev na levi strani najprej!")
  const name = normalizedText(customCharge.value.ime).trim()
  const price = toNumber(customCharge.value.cena, NaN)
  if (!name) return alert('Vpiši ime artikla ali storitve.')
  if (!Number.isFinite(price) || price === 0) return alert('Vpiši znesek različen od 0.')
  const { data } = await supabase.from('orders').insert([{ user_id: activeUser.value.id, ime_artikla: name, znesek: price, placano: false, custom: true }]).select()
  if(data) {
    const o = { id: data[0].id, userId: data[0].user_id, ime: data[0].ime_artikla, cena: data[0].znesek, placano: false, created_at: data[0].timestamp, custom: true }
    currentOrders.value.push(o); allOrders.value.push(o)
    customCharge.value = { ime: '', cena: null }
    showCustomCharge.value = false
  }
}

const findDrinkForOrder = (orderName) => drinks.value.find(d => d.ime === orderName)

const deleteOrderAndRestoreStock = async (order) => {
  if (!order) return;
  if (isDrinkOrderName(order.ime)) {
    const drink = findDrinkForOrder(order.ime);
    if (drink && drink.zaloga !== null) {
      drink.zaloga++;
      await supabase.from('drinks').update({ zaloga: drink.zaloga }).eq('id', drink.id);
    }
  }
  await supabase.from('orders').delete().eq('id', order.id)
  currentOrders.value = currentOrders.value.filter(o => o.id !== order.id)
  allOrders.value = allOrders.value.filter(o => o.id !== order.id)
}

const removeOrder = async (id) => { 
  if(!confirm('Zmotno vnešeno? Brišem in vrnem v omarico?')) return;
  const order = allOrders.value.find(o => o.id === id);
  await deleteOrderAndRestoreStock(order)
}

const addOrderGroupItem = async (group) => {
  const drink = findDrinkForOrder(group.ime)
  if (!drink) return alert('Artikla ne najdem več v omarici.')
  await addDrink(drink, group.cena)
}

const removeOrderGroupItem = async (group) => {
  const order = group.orders[group.orders.length - 1]
  await deleteOrderAndRestoreStock(order)
}

const removeOrderGroup = async (group) => {
  const message = group.quantity > 1
    ? `Odstranim vseh ${group.quantity} × ${group.ime} in vrnem zalogo?`
    : 'Zmotno vnešeno? Brišem in vrnem v omarico?'
  if(!confirm(message)) return;
  for (const order of [...group.orders]) await deleteOrderAndRestoreStock(order)
}

const clearTab = async () => {
  if(!confirm(`Res želiš POBRISATI CELOTEN zapitek za ${activeUser.value.ime}? Pijače se vrnejo v zalogo.`)) return;
  for (const order of [...userCurrentOrders.value]) await deleteOrderAndRestoreStock(order)
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

const selectedMonthLabel = computed(() => {
  const date = new Date(selectedYear.value, selectedMonth.value, 1)
  return `${date.toLocaleString('sl-SI', { month: 'long' })} ${selectedYear.value}`
})

const stats = computed(() => {
  const now = new Date()
  const startOfShift = new Date(now); if (now.getHours() < 4 || (now.getHours() === 4 && now.getMinutes() < 30)) startOfShift.setDate(startOfShift.getDate() - 1); startOfShift.setHours(4, 30, 0, 0)
  const startOfWeek = getMonday(now);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 4, 30, 0)
  const startOfYear = new Date(now.getFullYear(), 0, 1)
  const startOfSelectedMonth = new Date(selectedYear.value, selectedMonth.value, 1, 4, 30, 0)
  const endOfSelectedMonth = new Date(selectedYear.value, selectedMonth.value + 1, 1, 4, 30, 0)

  let d = 0, w = 0, m = 0, selectedMonthly = 0, y = 0;
  allOrders.value.filter(o => o.placano).forEach(o => {
    const time = new Date(o.created_at).getTime()
    if (time >= startOfShift.getTime()) d += o.cena
    if (time >= startOfWeek.getTime()) w += o.cena
    if (time >= startOfMonth.getTime()) m += o.cena
    if (time >= startOfSelectedMonth.getTime() && time < endOfSelectedMonth.getTime()) selectedMonthly += o.cena
    if (time >= startOfYear.getTime()) y += o.cena
  })
  return { daily: d, weekly: w, monthly: m, selectedMonthly, yearly: y }
})

const orderMatchesActiveFilter = (order, now = new Date()) => {
  const time = new Date(order.created_at)
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
}

const filteredOrdersForStats = computed(() => {
  const now = new Date()
  return allOrders.value.filter(o => {
    if (!o.placano) return false;
    return orderMatchesActiveFilter(o, now)
  });
});

const filteredOrdersForMarket = computed(() => {
  const now = new Date()
  return allOrders.value.filter(o => isDrinkOrderName(o.ime) && orderMatchesActiveFilter(o, now))
})

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
    if(!isDrinkOrderName(o.ime)) return;
    if(!map[o.ime]) map[o.ime] = { ime: o.ime, kolicina: 0 }
    map[o.ime].kolicina += 1
  })
  return Object.values(map).sort((a,b) => b.kolicina - a.kolicina)
})

const marketRows = computed(() => {
  const rows = sortedDrinks.value.map((drink) => {
    const marketOrders = filteredOrdersForMarket.value.filter(o => o.ime === drink.ime)
    const soldQty = marketOrders.length
    const revenue = marketOrders.reduce((sum, order) => sum + Number(order.cena || 0), 0)
    const buyPrice = getLatestBuyPrice(drink)
    const stock = Number(drink.zaloga || 0)
    const sellPrice = Number(drink.cena || 0)
    const realizedProfit = buyPrice > 0 ? revenue - (soldQty * buyPrice) : revenue
    const stockValue = stock * buyPrice
    const potentialRevenue = stock * sellPrice
    const potentialProfit = buyPrice > 0 ? potentialRevenue - stockValue : potentialRevenue
    const marginPct = sellPrice > 0 && buyPrice > 0 ? ((sellPrice - buyPrice) / sellPrice) * 100 : 0
    const minStock = Number(drink.min_zaloga || 0)
    let suggestion = ''
    let suggestionClass = ''

    if (stock <= minStock && soldQty > 0 && marginPct >= 25) {
      suggestion = 'Obnovi zalogo'
      suggestionClass = 'renew'
    } else if (buyPrice > 0 && marginPct < 20) {
      suggestion = 'Dvigni ceno'
      suggestionClass = 'raise'
    } else if (stock > minStock * 2 && soldQty === 0) {
      suggestion = 'Počasna prodaja'
      suggestionClass = 'lower'
    } else if (soldQty >= 3 && marginPct >= 45) {
      suggestion = 'Top prodaja'
      suggestionClass = 'top'
    }

    return {
      id: drink.id,
      ime: drink.ime,
      soldQty,
      revenue,
      buyPrice,
      stock,
      stockValue,
      potentialProfit,
      realizedProfit,
      marginPct,
      suggestion,
      suggestionClass
    }
  })

  const { key, dir } = marketSort.value
  const direction = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const aValue = a[key]
    const bValue = b[key]
    if (typeof aValue === 'string' || typeof bValue === 'string') {
      const result = String(aValue || '').localeCompare(String(bValue || ''), 'sl', { sensitivity: 'base' })
      return result * direction
    }
    return ((Number(aValue) || 0) - (Number(bValue) || 0)) * direction
  })
})

const marketSummary = computed(() => marketRows.value.reduce((totals, row) => {
  totals.stockValue += row.stockValue
  totals.potentialProfit += row.potentialProfit
  totals.realizedProfit += row.realizedProfit
  return totals
}, { stockValue: 0, potentialProfit: 0, realizedProfit: 0 }))

const getMarketRow = (drink) => {
    return marketRows.value.find(row => row.id === drink.id) || {
    soldQty: 0,
    stockValue: 0,
    potentialProfit: 0,
    realizedProfit: 0,
    marginPct: 0,
    suggestion: '',
    suggestionClass: ''
  }
}

const compareInventoryValues = (a, b, key) => {
  if (key === 'ime') return a.ime.localeCompare(b.ime, 'sl', { sensitivity: 'base' })
  return (Number(a[key]) || 0) - (Number(b[key]) || 0)
}

const sortInventoryRows = (rows) => {
  const direction = inventorySort.value.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => compareInventoryValues(a, b, inventorySort.value.key) * direction)
}

const inventoryRowsForCategory = (cat) => {
  return sortedDrinks.value
    .filter(drink => drink.kategorija === cat)
    .map(drink => ({ drink, ...getMarketRow(drink) }))
}

const sortedInventoryDrinks = (cat) => sortInventoryRows(inventoryRowsForCategory(cat)).map(row => row.drink)

const inventoryCategoryRows = computed(() => uniqueCategories.value.map(cat => {
  const rows = inventoryRowsForCategory(cat)
  return {
    ime: cat,
    soldQty: rows.reduce((sum, row) => sum + row.soldQty, 0),
    realizedProfit: rows.reduce((sum, row) => sum + row.realizedProfit, 0),
    potentialProfit: rows.reduce((sum, row) => sum + row.potentialProfit, 0)
  }
}))

const sortedInventoryCategories = computed(() => sortInventoryRows(inventoryCategoryRows.value).map(row => row.ime))

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

const currentTariffs = computed(() => [...tariffs.value]
  .filter(t => t && normalizedText(t.kombinacija))
  .sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0) || normalizedText(a.kombinacija).localeCompare(normalizedText(b.kombinacija), 'sl', { sensitivity: 'base' })))

const startTable = (t) => { 
  if (!t.payer) { alert('Izberi nosilca plačila!'); return; }
  if (!isSpecialTariff.value || !flatRateActive.value) {
    if (!t.selectedTariff) { alert('Izberi tarifo!'); return; }
  }
  const payerSnapshot = { id: t.payer.id, ime: t.payer.ime, tip: t.payer.tip }
  t.payer = payerSnapshot
  t.lockedPayer = payerSnapshot
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
    const payer = t.lockedPayer || t.payer
    const newOrder = { user_id: payer.id, ime_artikla: `Miza ${t.id} (${rateName})`, znesek: t.currentCost, placano: false }
    const { data } = await supabase.from('orders').insert([newOrder]).select()
    if(data) {
       const o = { id: data[0].id, userId: data[0].user_id, ime: data[0].ime_artikla, cena: data[0].znesek, placano: false, created_at: data[0].timestamp }
       currentOrders.value.push(o); allOrders.value.push(o)
    }
  }
  t.status = 'prosta'; t.payer = activeUser.value || null; t.lockedPayer = null; t.selectedTariff = null; t.elapsedSeconds = 0; t.currentCost = 0; 
}

const addTable = () => { tables.value.push({ id: tables.value.length + 1, status: 'prosta', payer: activeUser.value || null, lockedPayer: null, selectedTariff: null, elapsedSeconds: 0, currentCost: 0, interval: null }) }
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
.kiosk-container { display: grid; grid-template-columns: minmax(210px, 0.85fr) minmax(320px, 1.25fr) minmax(340px, 1.3fr); height: 100vh; background: var(--bg-color); color: var(--text-color); padding: 15px; gap: 15px; font-family: sans-serif; box-sizing: border-box;   height: 100dvh; overflow: hidden; }
.db-error-banner { position: fixed; top: 10px; left: 50%; transform: translateX(-50%); z-index: 2000; display: flex; align-items: center; gap: 10px; max-width: min(920px, calc(100vw - 24px)); padding: 10px 12px; border-radius: 8px; background: #3b1f1f; border: 1px solid #ff5252; color: #fff; box-shadow: 0 12px 28px rgba(0,0,0,0.35); font-size: 13px; }
.db-error-banner span { color: #ffd6d6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.db-error-banner button { border: none; border-radius: 6px; padding: 7px 10px; background: #ff5252; color: white; font-weight: 800; cursor: pointer; white-space: nowrap; }
.db-error-banner button:disabled { opacity: 0.6; cursor: wait; }
.panel { background: var(--panel-bg); padding: 20px; border-radius: 12px; overflow-y: auto; border: 1px solid var(--border-color); overflow-y: auto; padding-bottom: 120px !important; }

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
.user-item { display: flex; justify-content: space-between; align-items: center; padding: 7px 9px; background: var(--item-bg); border-radius: 8px; margin-bottom: 5px; cursor: pointer; border: 1px solid transparent; gap: 7px; }
.is-member { border-left: 6px solid #2980b9; }
.is-guest { border-left: 6px solid #888; }
.selected-user { background: #354a35 !important; border-color: #4caf50; color: white;}
.user-info { text-align: left; flex-grow: 1; min-width: 0; }
.user-info strong { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; font-size: var(--victim-fz); font-weight: var(--victim-fw); }

.user-actions { display: flex; align-items: center; gap: 5px; flex-shrink: 0; justify-content: flex-end; }
.debt-warning { color: #ff5252; font-weight: bold; font-size: 12px; white-space: nowrap; margin-right: 3px; }
.credit-warning { color: #4caf50; font-weight: bold; font-size: 12px; white-space: nowrap; margin-right: 3px; }
.user-badge-static { font-size: 10px; color: white; padding: 1px 4px; border-radius: 3px; font-weight: bold; width: 12px; text-align: center;}
.badge-clan { background: #2980b9; }
.badge-neclan { background: #555; }
.btn-icon { background: var(--border-color); border: none; color: var(--text-color); padding: 5px 7px; cursor: pointer; border-radius: 4px; }
.btn-del-red { background: #c62828; color: white;}

/* DRINKS & CATEGORIES */
.cat-section { width: 100%; margin-bottom: 25px; }
.cat-title-box { background: var(--input-bg); padding: 8px 15px; border-radius: 8px; text-align: center; margin-bottom: 15px; border: 1px solid var(--border-color); }
.cat-title-box h3 { margin: 0; text-transform: uppercase; font-weight: bold; }
.drink-grid { display: grid; width: 100%; gap: 10px; justify-content: stretch; align-items: stretch; }
.btn-drink { width: var(--drink-w); min-width: 0; min-height: var(--drink-h); height: auto; font-size: var(--drink-fz); color: var(--drink-fc); padding: 10px 8px; border: 1px solid rgba(0,0,0,0.15); cursor: pointer; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.15); display: flex; flex-direction: column; justify-content: center; align-items: center; overflow: hidden;}
.btn-drink:active { transform: scale(0.97); }
.drink-name { width: 100%; margin-bottom: 5px; font-size: var(--drink-name-fz); font-weight: var(--drink-name-fw); line-height: 1.12; overflow-wrap: anywhere; word-break: normal; hyphens: auto;}
.drink-price-area { display: flex; flex-direction: column; align-items: center; max-width: 100%; font-size: var(--drink-price-fz); line-height: 1.15; overflow-wrap: anywhere; }
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
.active-payer-display { color: var(--text-color); font-size: 13px; font-weight: 800; margin: 0 0 5px; }
.timer { font-size: 32px; font-family: monospace; font-weight: bold; color: #4caf50; margin: 5px 0; }
.current-cost { font-size: 18px; font-weight: bold; margin-bottom: 10px; }
.table-controls { display: flex; gap: 10px; }
.btn-start { background: #2e7d32; color: white; border: none; padding: 12px; width: 100%; cursor: pointer; border-radius: 6px; font-weight: bold; }
.btn-stop { background: #c62828; color: white; border: none; padding: 12px; width: 100%; cursor: pointer; border-radius: 6px; font-weight: bold; }
.btn-warn { background: #f57c00; color: white; border: none; padding: 12px; width: 100%; cursor: pointer; border-radius: 6px; font-weight: bold; }

/* TAB (ZAPITEK) */
.tab-section { margin-top: 25px; padding-top: 15px; border-top: 2px solid var(--border-color); }
.tab-title-row { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 10px; }
.tab-title-row h3 { margin: 0; }
.custom-charge-toggle { background: #2e7d32; }
.custom-charge-toggle.active { background: #c62828; }
.custom-charge-row { display: grid; grid-template-columns: minmax(0, 1fr) 76px 86px; gap: 6px; align-items: center; margin-bottom: 12px; background: rgba(0,0,0,0.12); border: 1px solid var(--border-color); border-radius: 8px; padding: 8px; }
.custom-charge-name, .custom-charge-price { width: 100%; box-sizing: border-box; }
.custom-charge-price { text-align: right; }
.order-list { max-height: 250px; overflow-y: auto; margin-bottom: 15px; }
.order-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 9px 3px; border-bottom: 1px solid var(--border-color); }
.order-main { display: flex; flex: 1 1 auto; flex-direction: column; align-items: flex-start; min-width: 0; text-align: left; }
.order-name { width: 100%; font-weight: bold; font-size: 15px; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.order-meta { color: #888; font-size: 11px; line-height: 1.2; white-space: nowrap; }
.order-controls { display: grid; grid-template-columns: 70px 28px 16px 28px 30px; align-items: center; justify-content: end; column-gap: 6px; row-gap: 4px; flex: 0 0 auto; }
.order-total { font-weight: bold; font-size: 15px; white-space: nowrap; text-align: right; }
.order-qty { min-width: 0; text-align: center; font-size: 15px; font-weight: bold; }
.btn-qty { width: 28px; height: 30px; border: none; border-radius: 6px; color: white; cursor: pointer; font-size: 17px; font-weight: bold; line-height: 1; display: inline-flex; align-items: center; justify-content: center; }
.btn-qty-minus { background: #c62828; }
.btn-qty-plus { background: #2e7d32; }
.btn-del-mini { background: #c62828; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-weight: bold; }
.order-controls .btn-del-mini { grid-column: 5; }
.tab-actions { display: flex; gap: 10px; align-items: stretch; }
.btn-pay { background: #1976d2; color: white; border: none; padding: 15px; cursor: pointer; border-radius: 6px; font-weight: bold; font-size: 16px; }
.empty-state { text-align: center; padding: 30px; color: #888; font-style: italic; }

/* ADMIN MODAL WINDOW */
.modal-overlay { position: fixed; top:0; left:0; width:100%; height:100%; background: rgba(0,0,0,0.85); display: flex; justify-content: center; align-items: center; z-index: 1000; }
.modal-content { background: var(--panel-bg); border: 1px solid var(--border-color); padding: 35px; border-radius: 12px; box-shadow: 0 24px 70px rgba(0,0,0,0.45); }
.admin-large { width: min(1180px, calc(100vw - 32px)); height: min(820px, calc(100vh - 48px)); display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden; }
.auth-small { width: 330px !important; padding: 20px !important; border-radius: 10px; }

/* COMPACT AUTH DIALOG */
.auth-box-compact h3 { text-align: center; margin-bottom: 12px; font-size: 16px; color: var(--text-color); margin-top: 0;}
.input-compact { padding: 8px 10px !important; font-size: 15px !important; margin-bottom: 12px !important; letter-spacing: 4px; }
.auth-buttons-compact { display: flex; gap: 8px; }
.btn-compact-action { padding: 8px !important; font-size: 13px !important; border-radius: 4px !important; flex: 1; font-weight: bold; cursor: pointer; border: none; color: white;}

/* ADMIN INSIDE */
.admin-dashboard { display: flex; flex-direction: column; min-height: 0; height: 100%; }
.admin-tabs { display: flex; gap: 8px; margin-bottom: 18px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px; flex-wrap: wrap;}
.tab-btn { background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)); color: #a7a7ad; border: 1px solid var(--border-color); font-size: 13px; cursor: pointer; font-weight: bold; padding: 8px 12px; border-radius: 999px; transition: all 0.18s ease; }
.tab-btn:hover { color: var(--text-color); border-color: rgba(76,175,80,0.55); }
.tab-btn.active { color: #ffffff; background: linear-gradient(135deg, #2e7d32, #43a047); border-color: #66bb6a; box-shadow: 0 8px 20px rgba(76,175,80,0.22); }
.admin-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; padding-right: 10px; }
.admin-cat-block { margin-bottom: 20px; background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01)); padding: 16px; border-radius: 8px; border: 1px solid var(--border-color); border-left: 4px solid #4caf50; }
.cat-header { display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 5px; margin-bottom: 10px; align-items: center;}
.category-name-input { width: min(260px, 52vw); font-size: 20px; font-weight: 800; text-transform: none; }

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
.fold-btn { width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--input-bg); color: var(--text-color); cursor: pointer; font-weight: 900; line-height: 1; }
.fold-btn:hover { border-color: #4caf50; color: #4caf50; }
.inline-add-row { display: flex; align-items: center; gap: 10px; background: var(--input-bg); padding: 10px; border-radius: 6px; }
.settings-grid, .tab-name-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
.settings-grid label, .tab-name-grid label { display: flex; flex-direction: column; gap: 6px; text-align: left; color: #aaa; font-size: 12px; font-weight: bold; }
.settings-grid .check-row { flex-direction: row; align-items: center; background: var(--input-bg); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; }
.settings-grid .check-row input { transform: scale(1.2); }
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
.market-summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px; }
.market-card { background: linear-gradient(135deg, rgba(76,175,80,0.2), rgba(25,118,210,0.12)); border: 1px solid rgba(76,175,80,0.28); border-radius: 8px; padding: 14px; text-align: left; }
.market-card span { display: block; color: #aaa; font-size: 12px; font-weight: bold; margin-bottom: 6px; }
.market-card strong { color: var(--text-color); font-size: 22px; }
.inventory-sort-panel { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; padding: 10px 12px; }
.inventory-sort-panel span { color: #aaa; font-size: 12px; font-weight: 800; margin-right: 2px; }
.inventory-sort-panel .btn-toggle { flex: 0 0 auto; width: auto; padding: 7px 10px; font-size: 12px; }
.inventory-item { display: grid; grid-template-columns: minmax(90px, 0.7fr) minmax(180px, 0.8fr) auto minmax(305px, auto); gap: 7px; padding: 12px 0; border-bottom: 1px dashed var(--border-color); align-items: center; }
.inventory-title { display: flex; flex-direction: column; gap: 5px; text-align: left; min-width: 0; }
.inventory-title strong { color: var(--text-color); font-size: 15px; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.inventory-title span { color: #9aa0a6; font-size: 12px; font-weight: bold; }
.inventory-controls { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
.mini-field { display: flex; align-items: center; gap: 5px; }
.mini-field span { font-size: 11px; color: #888; font-weight: bold; }
.mini-field input { width: 42px; text-align: center; }
.stock-stepper { display: flex; align-items: center; gap: 5px; }
.purchase-row { display: grid; grid-template-columns: minmax(40px, 50px) repeat(2, minmax(54px, 66px)) minmax(78px, 86px) auto; gap: 5px; align-items: end; justify-content: start; background: rgba(0,0,0,0.12); border: 1px solid var(--border-color); border-radius: 8px; padding: 7px; min-width: 0; }
.purchase-row label { display: flex; flex-direction: column; gap: 5px; text-align: left; color: #aaa; font-size: 10px; font-weight: bold; }
.purchase-row input { width: 100%; box-sizing: border-box; }
.purchase-save { height: 32px; white-space: nowrap; padding: 6px 6px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; }
.purchase-undo { height: 32px; white-space: nowrap; padding: 6px 7px; font-size: 12px; }
.purchase-undo:disabled { opacity: 0.38; cursor: not-allowed; filter: grayscale(0.6); }
.market-line { display: flex; flex-wrap: nowrap; gap: 5px; min-width: 0; }
.market-line span { background: var(--input-bg); border: 1px solid var(--border-color); border-radius: 999px; color: #aaa; font-size: 10px; font-weight: bold; padding: 5px 7px; min-width: 58px; max-width: 76px; display: flex; flex-direction: column; align-items: center; gap: 2px; line-height: 1.05; overflow: hidden; }
.market-line small { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 9px; color: #9aa0a6; }
.market-line strong { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-color); font-size: 11px; }
.btn-stock { background: var(--border-color); color: var(--text-color); border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-weight: bold; }
.btn-stock-minus { background: #c62828; color: white;}
.btn-stock-plus { background: #2e7d32; color: white;}
.stock-input-large { width: 48px; text-align: center; font-weight: bold; font-size: 16px; }
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
.market-table-card { max-width: 100%; overflow: hidden; box-sizing: border-box; position: static; }
.market-table-card .stat-table { table-layout: fixed; width: 100%; min-width: 0; }
.market-table-card .stat-table th,
.market-table-card .stat-table td { padding: 5px 6px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }
.market-table-card .stat-table th { padding: 0 6px 6px; font-size: 12px; vertical-align: middle; }
.market-table-card .stat-table th:first-child,
.market-table-card .stat-table td:first-child { width: 34%; white-space: normal; }
.market-col-name { text-align: left !important; }
.market-col-center { text-align: center !important; }
.player-col-name { text-align: left !important; }
.player-col-center { text-align: center !important; }
.sort-header { width: 100%; display: inline-flex; align-items: center; gap: 4px; border: none; background: transparent; color: #888; font: inherit; font-weight: 800; cursor: pointer; padding: 6px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.market-col-center .sort-header { justify-content: center; }
.market-col-name .sort-header { justify-content: flex-start; }
.player-col-center .sort-header { justify-content: center; }
.player-col-name .sort-header { justify-content: flex-start; }
.sort-header:hover { color: var(--text-color); }
.sort-header span { display: inline-block; width: 9px; flex: 0 0 9px; color: #4caf50; }
.market-pill { display: inline-flex; align-items: center; justify-content: center; min-width: 0; max-width: 100%; border-radius: 999px; padding: 4px 7px; font-size: 10px; font-weight: bold; color: #fff; white-space: nowrap; }
.market-pill.renew { background: #2e7d32; }
.market-pill.raise { background: #c77700; }
.market-pill.lower { background: #1976d2; }
.market-pill.top { background: #6a8f2a; }

.chart-box { background: var(--item-bg); padding: 20px; border-radius: 8px; border: 1px solid var(--border-color); }
.css-chart { display: flex; align-items: flex-end; justify-content: space-around; height: 160px; margin-top: 20px; border-bottom: 1px solid #555; padding-bottom: 10px; }
.bar-col { display: flex; flex-direction: column; align-items: center; width: 10%; height: 100%; justify-content: flex-end; }
.bar-fill { background: #4caf50; width: 100%; border-radius: 4px 4px 0 0; min-height: 4%; display: flex; align-items: flex-start; justify-content: center; position: relative; transition: height 0.4s ease; }
.bar-amount { position: absolute; top: -20px; font-size: 11px; color: #ccc; font-weight: bold; }
.bar-label { margin-top: 5px; font-size: 12px; color: #aaa; font-weight: bold; }

.btn-file-upload { cursor: pointer; text-align:center; padding: 12px; border-radius:6px; font-weight:bold; color: white; display: inline-block;}

.watermark {
  left: 50%;
  right: auto;
  bottom: 8px;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: max-content;
  max-width: calc(100vw - 24px);
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(18, 18, 18, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.35);
  color: #b8b8bd;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
  z-index: 900;
}

.watermark .author-link {
  margin-left: 4px;
  color: #58a6ff;
  text-decoration: none;
  font-weight: 800;
}

@media (max-width: 760px), (orientation: portrait) and (max-width: 900px) {
  :global(html), :global(body) {
    height: auto;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .kiosk-container {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    height: auto;
    overflow: visible;
    padding: 8px;
    gap: 10px;
  }

  .panel {
    width: 100%;
    padding: 12px;
    padding-bottom: 24px !important;
    border-radius: 8px;
    overflow: visible;
    box-sizing: border-box;
  }

  h2 {
    font-size: 20px;
    margin-bottom: 12px;
  }

  .quick-add {
    margin-bottom: 16px !important;
  }

  .user-item {
    padding: 8px 9px;
  }

  .drink-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 8px;
  }

  .btn-drink {
    width: 100%;
    min-height: 68px;
    height: auto;
    padding: 10px 6px;
    font-size: 14px;
  }

  .table-card {
    padding: 12px;
    margin-bottom: 10px;
  }

  .table-controls,
  .tab-actions,
  .auth-buttons,
  .auth-buttons-compact {
    gap: 8px;
  }

  .timer {
    font-size: 28px;
  }

  .order-list {
    max-height: none;
    overflow: visible;
  }

  .order-row {
    align-items: center;
    gap: 6px;
  }

  .order-controls {
    grid-template-columns: 48px 28px 14px 28px 24px;
    gap: 3px;
  }

  .order-total {
    font-size: 14px;
    text-align: right;
  }

  .btn-qty {
    width: 28px;
    height: 30px;
  }

  .order-qty {
    font-size: 14px;
  }

  .btn-del-mini {
    padding: 4px 7px;
  }

  .modal-overlay {
    align-items: flex-start;
    overflow-y: auto;
    padding: 10px;
    box-sizing: border-box;
  }

  .modal-content,
  .admin-large,
  .auth-small {
    width: 100% !important;
    max-width: none;
    padding: 14px !important;
    box-sizing: border-box;
  }

  .admin-large {
    height: calc(100dvh - 20px) !important;
  }

  .admin-dashboard {
    min-height: 0;
  }

  .admin-tabs {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 8px;
  }

  .tab-btn {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .admin-scroll {
    flex: 1 1 auto;
    min-height: 0;
    max-height: none;
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 0;
  }

  .market-summary-grid {
    grid-template-columns: 1fr;
  }

  .market-card strong {
    font-size: 20px;
  }

  .inventory-item {
    grid-template-columns: 1fr;
    overflow: hidden;
  }

  .inventory-controls {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .purchase-row {
    grid-template-columns: 1fr;
  }

  .market-line {
    gap: 6px;
  }

  .market-line span {
    max-width: 100%;
    white-space: normal;
  }

  .admin-item,
  .inline-add-row,
  .cat-header {
    flex-wrap: wrap;
  }

  .name-input {
    min-width: 150px;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }

  .watermark {
    position: static !important;
    left: auto;
    right: auto;
    bottom: auto;
    transform: none;
    margin: 8px auto 0;
    padding: 6px 10px;
    font-size: 12px;
  }
}
</style>
