(function () {
    const url = "https://ehecjvminmftnsjbwsoe.supabase.co";

    const key = "sb_publishable_mAIy2PkaQ6gxhKWGapW-lw_lFgRHPkO";

    if (!window.supabase || !window.supabase.createClient) {
        console.error("Supabase library failed to load.");
        window.supabaseClient = null;
        return;
    }

    window.supabaseClient = window.supabase.createClient(url, key, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    });
})();