import { createClient } from '@supabase/supabase-js'

// You will replace these two strings with your actual project details
const supabaseUrl = 'https://pxnkzgighwhmzcigcoqy.supabase.co'
const supabaseAnonKey = 'sb_publishable_iU6iLVmfzGJatPoe2R7jDA_GbxYMNpa'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)