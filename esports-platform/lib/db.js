const { createClient } = require('@supabase/supabase-js');
// Service-role key: sirf server pe. RLS bypass hota hai, isliye har route me authorization zaroori hai.
module.exports = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
