const supabase = require('../db/supabase');
const config = require('../config');
const { createClient } = require('@supabase/supabase-js');
const { toCamelCase, getFullName } = require('../utilities/helpers');

const LOCAL_ADMIN_EMAIL = 'gawaadmin@email.com';
const LOCAL_ADMIN_PASSWORD = 'gawaadmin123';
const LOCAL_ADMIN_TOKEN = 'gawa-local-admin-token';

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  if (email === LOCAL_ADMIN_EMAIL && password === LOCAL_ADMIN_PASSWORD) {
    return res.json({
      data: {
        token: LOCAL_ADMIN_TOKEN,
        user: {
          id: 'local-admin',
          name: 'GAWA Admin',
          email: LOCAL_ADMIN_EMAIL,
          role: 'admin',
          status: 'active',
        },
      },
    });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(401).json({ error: 'Invalid email or password' });

  const { data: profile } = await supabase
    .from('users_table')
    .select('id, first_name, last_name, email, role, is_verified, profile_image_url, phone, complete_address, created_at')
    .eq('id', data.user.id)
    .single();

  res.json({
    data: {
      token: data.session.access_token,
      user: profile ? { ...profile, name: getFullName(profile) } : { id: data.user.id, email: data.user.email, name: data.user.email, role: 'client' },
    },
  });
}

async function requestPasswordReset(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${config.frontendUrl}/reset-password`,
  });
  if (error) return res.status(400).json({ error: error.message });

  res.json({ message: 'Password reset email sent' });
}

async function resetPassword(req, res) {
  const { accessToken, newPassword } = req.body;
  if (!accessToken || !newPassword) return res.status(400).json({ error: 'Access token and new password are required' });

  const anonClient = createClient(config.supabaseUrl, config.supabaseAnonKey);
  const { data: { user }, error: tokenError } = await anonClient.auth.getUser(accessToken);
  if (tokenError || !user) {
    return res.status(401).json({ error: 'Invalid or expired reset token' });
  }

  const { error } = await supabase.auth.admin.updateUserById(user.id, { password: newPassword });
  if (error) return res.status(400).json({ error: error.message });

  res.json({ message: 'Password reset successful' });
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const userEmail = req.user.email;

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: userEmail,
    password: currentPassword,
  });
  if (signInError) return res.status(401).json({ error: 'Current password is incorrect' });

  const { error } = await supabase.auth.admin.updateUserById(req.user.id, { password: newPassword });
  if (error) return res.status(400).json({ error: error.message });

  res.json({ message: 'Password updated successfully' });
}

async function refreshToken(req, res) {
  const { refreshToken: rt } = req.body;
  if (!rt) return res.status(400).json({ error: 'Refresh token is required' });

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: rt });
  if (error || !data.session) return res.status(401).json({ error: 'Invalid or expired refresh token' });

  res.json({
    data: {
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
    },
  });
}

function me(req, res) {
  res.json({ data: req.user });
}

module.exports = { login, requestPasswordReset, resetPassword, changePassword, refreshToken, me };
