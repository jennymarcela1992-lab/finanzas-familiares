import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SUPABASE_URL = "https://yobaaffstxogqniuukup.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvYmFhZmZzdHhvZ3FuaXV1a3VwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2Njc2MDQsImV4cCI6MjEwMjI0MzYwNH0.r8dbgr9JHDCmval1sHJaThKcjWE3rZW2I_aOZxMEoy4";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
