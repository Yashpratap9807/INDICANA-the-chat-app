/**
 * INDICANA Auth UI
 */

const AuthUI = (() => {
  let pendingOtpLogin = null;
  let pendingPasswordReset = null;

  function render() {
    const runtime = API.getRuntimeSummary();

    return `
      <div class="auth-container">
        <div class="auth-card">
          <div class="auth-logo">
            <div class="logo-mark">✦</div>
            <div class="logo-text">INDICANA</div>
            <div class="logo-sub">Search profiles, share photos, and call securely</div>
          </div>

          <div class="auth-tabs">
            <button class="tab-btn active" id="tab-login" onclick="AuthUI.switchTab('login')">Sign In</button>
            <button class="tab-btn" id="tab-register" onclick="AuthUI.switchTab('register')">Create Account</button>
          </div>

          ${connectionNoticeMarkup(runtime)}

          <form id="login-form" class="auth-form" onsubmit="AuthUI.handleLogin(event)">
            <div id="login-password-step">
              <div class="field-group">
                <label for="login-username">Username</label>
                <input id="login-username" type="text" placeholder="Enter your username" autocomplete="username" required />
              </div>
              <div class="field-group">
                <label for="login-password">Password</label>
                <input id="login-password" type="password" placeholder="Enter your password" autocomplete="current-password" required />
              </div>
              <button type="button" class="auth-link-btn" onclick="AuthUI.showReset()">Forgot password?</button>
            </div>

            <div id="login-otp-step" class="hidden">
              <div class="keygen-notice">
                <span class="keygen-icon">🔐</span>
                <span id="otp-help-text">Enter the 6-digit code sent to your verified phone. In dev mode, check the backend console.</span>
              </div>
              <div class="field-group">
                <label for="login-otp">One-Time Password</label>
                <input id="login-otp" type="text" placeholder="Enter 6-digit code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" />
              </div>
              <button type="button" class="btn-secondary auth-secondary-btn" onclick="AuthUI.resetLoginOtp()">Back</button>
            </div>

            <button type="submit" class="btn-primary" id="login-submit">
              <span id="login-label">Sign In</span>
              <div class="btn-loader hidden" id="login-loader"></div>
            </button>
            <p class="auth-error hidden" id="login-error"></p>
          </form>

          <form id="reset-form" class="auth-form hidden" onsubmit="AuthUI.handleResetPassword(event)">
            <div id="reset-request-step">
              <div class="field-group">
                <label for="reset-username">Username</label>
                <input id="reset-username" type="text" placeholder="Enter your username" autocomplete="username" required />
              </div>
              <div class="keygen-notice">
                <span class="keygen-icon">📱</span>
                <span>Your verified phone will receive a reset OTP. In dev mode, check the backend console.</span>
              </div>
            </div>

            <div id="reset-verify-step" class="hidden">
              <div class="keygen-notice">
                <span class="keygen-icon">🔄</span>
                <span id="reset-help-text">Enter the OTP sent to your verified phone and choose a new password.</span>
              </div>
              <div class="field-group">
                <label for="reset-otp">Reset OTP</label>
                <input id="reset-otp" type="text" placeholder="Enter 6-digit code" maxlength="6" inputmode="numeric" />
              </div>
              <div class="field-group">
                <label for="reset-password">New Password</label>
                <input id="reset-password" type="password" placeholder="Min 8 characters" autocomplete="new-password" />
              </div>
            </div>

            <div class="auth-inline-actions">
              <button type="button" class="btn-secondary auth-secondary-btn" onclick="AuthUI.cancelReset()">Back to sign in</button>
            </div>

            <button type="submit" class="btn-primary" id="reset-submit">
              <span id="reset-label">Send Reset OTP</span>
              <div class="btn-loader hidden" id="reset-loader"></div>
            </button>
            <p class="auth-error hidden" id="reset-error"></p>
          </form>

          <form id="register-form" class="auth-form hidden" onsubmit="AuthUI.handleRegister(event)">
            <div class="field-group">
              <label for="reg-username">Username</label>
              <input id="reg-username" type="text" placeholder="Choose a username" autocomplete="username" required minlength="3" maxlength="32" pattern="[a-zA-Z0-9_]+" />
              <span class="field-hint">Letters, numbers and underscores only</span>
            </div>
            <div class="field-group">
              <label for="reg-phone">Phone (Optional)</label>
              <input id="reg-phone" type="text" placeholder="+919876543210" autocomplete="tel" />
              <span class="field-hint">Use international format if you want OTP login later</span>
            </div>
            <div class="field-group">
              <label for="reg-bio">Bio</label>
              <input id="reg-bio" type="text" placeholder="Tell people a little about yourself" maxlength="160" />
            </div>
            <div class="field-group">
              <label for="reg-password">Password</label>
              <input id="reg-password" type="password" placeholder="Min 8 characters" autocomplete="new-password" required minlength="8" />
            </div>
            <div class="field-group">
              <label for="reg-password2">Confirm Password</label>
              <input id="reg-password2" type="password" placeholder="Repeat password" autocomplete="new-password" required minlength="8" />
            </div>
            <div class="keygen-notice">
              <span class="keygen-icon">🔑</span>
              <span>Your encryption key pair is created on this device, and your private key never leaves the browser.</span>
            </div>
            <button type="submit" class="btn-primary" id="reg-submit">
              <span id="reg-label">Create Account</span>
              <div class="btn-loader hidden" id="reg-loader"></div>
            </button>
            <p class="auth-error hidden" id="reg-error"></p>
          </form>
        </div>
      </div>
    `;
  }

  function connectionNoticeMarkup(runtime) {
    if (!runtime.needsPublicBackend) return '';

    return `
      <div class="auth-runtime-warning">
        <strong>Backend setup needed</strong>
        <p>This APK is still using <code>${escapeHtml(runtime.apiBase)}</code>. On a phone, that points to the phone itself, so sign up and login will fail until the app is rebuilt with a real backend URL.</p>
      </div>
    `;
  }

  function switchTab(tab) {
    const isLogin = tab === 'login';
    document.getElementById('login-form').classList.toggle('hidden', !isLogin);
    document.getElementById('register-form').classList.toggle('hidden', isLogin);
    document.getElementById('reset-form').classList.add('hidden');
    document.getElementById('tab-login').classList.toggle('active', isLogin);
    document.getElementById('tab-register').classList.toggle('active', !isLogin);
    resetLoginOtp();
    cancelReset(true);
  }

  function showReset() {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('reset-form').classList.remove('hidden');
    document.getElementById('tab-login').classList.remove('active');
    document.getElementById('tab-register').classList.remove('active');
    hideError('reset-error');
  }

  function cancelReset(silent = false) {
    pendingPasswordReset = null;
    document.getElementById('reset-request-step').classList.remove('hidden');
    document.getElementById('reset-verify-step').classList.add('hidden');
    document.getElementById('reset-label').textContent = 'Send Reset OTP';
    if (!silent) {
      document.getElementById('reset-form').classList.add('hidden');
      document.getElementById('login-form').classList.remove('hidden');
      document.getElementById('tab-login').classList.add('active');
      document.getElementById('tab-register').classList.remove('active');
    }
    const otp = document.getElementById('reset-otp');
    const pwd = document.getElementById('reset-password');
    if (otp) otp.value = '';
    if (pwd) pwd.value = '';
    hideError('reset-error');
  }

  function setLoading(labelId, loaderId, submitId, loading) {
    document.getElementById(labelId).classList.toggle('hidden', loading);
    document.getElementById(loaderId).classList.toggle('hidden', !loading);
    document.getElementById(submitId).disabled = loading;
  }

  function showError(id, message) {
    const element = document.getElementById(id);
    element.textContent = message;
    element.classList.remove('hidden');
  }

  function hideError(id) {
    document.getElementById(id).classList.add('hidden');
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function enterOtpStep(phoneHint) {
    pendingOtpLogin = { loginToken: phoneHint.loginToken };
    document.getElementById('login-password-step').classList.add('hidden');
    document.getElementById('login-otp-step').classList.remove('hidden');
    document.getElementById('login-label').textContent = 'Verify OTP';
    document.getElementById('otp-help-text').textContent = `Enter the 6-digit code sent to your verified phone ending in ${phoneHint.phoneHint}. In dev mode, check the backend console.`;
    document.getElementById('login-otp').focus();
  }

  function resetLoginOtp() {
    pendingOtpLogin = null;
    document.getElementById('login-password-step').classList.remove('hidden');
    document.getElementById('login-otp-step').classList.add('hidden');
    document.getElementById('login-label').textContent = 'Sign In';
    const otp = document.getElementById('login-otp');
    if (otp) otp.value = '';
    hideError('login-error');
  }

  async function finalizeLogin(token, user, sessionId) {
    const localKey = Store.getLocalKey(user.userId, user.username);
    if (!localKey || !localKey.secretKey) {
      showError('login-error', 'No local encryption key was found on this device. Register here first.');
      return;
    }

    Store.save({
      token,
      userId: user.userId,
      username: user.username,
      publicKey: user.publicKey,
      secretKey: localKey.secretKey,
      bio: user.bio || '',
      avatarHue: user.avatarHue || 260,
      profilePhoto: user.profilePhoto || '',
      phone: user.phone || '',
      phoneVerified: Boolean(user.phoneVerified),
      twoFactorEnabled: Boolean(user.twoFactorEnabled),
      currentSessionId: sessionId || '',
    });
    App.navigate('userList');
  }

  async function handleLogin(event) {
    event.preventDefault();
    hideError('login-error');
    setLoading('login-label', 'login-loader', 'login-submit', true);

    try {
      if (pendingOtpLogin) {
        const otp = document.getElementById('login-otp').value.trim();
        const { token, user, sessionId } = await API.verifyLoginOtp(pendingOtpLogin.loginToken, otp);
        pendingOtpLogin = null;
        await finalizeLogin(token, user, sessionId);
        return;
      }

      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;
      const data = await API.login(username, password);

      if (data.requiresOtp) {
        enterOtpStep(data);
        return;
      }

      await finalizeLogin(data.token, data.user, data.sessionId);
    } catch (err) {
      showError('login-error', err.message);
    } finally {
      setLoading('login-label', 'login-loader', 'login-submit', false);
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    hideError('reset-error');
    setLoading('reset-label', 'reset-loader', 'reset-submit', true);

    try {
      if (!pendingPasswordReset) {
        const username = document.getElementById('reset-username').value.trim();
        const data = await API.requestPasswordReset(username);
        pendingPasswordReset = data;
        document.getElementById('reset-request-step').classList.add('hidden');
        document.getElementById('reset-verify-step').classList.remove('hidden');
        document.getElementById('reset-label').textContent = 'Reset Password';
        document.getElementById('reset-help-text').textContent = `Enter the OTP sent to your verified phone ending in ${data.phoneHint}, then choose a new password.`;
        return;
      }

      const otp = document.getElementById('reset-otp').value.trim();
      const newPassword = document.getElementById('reset-password').value;
      await API.resetPassword(pendingPasswordReset.resetToken, otp, newPassword);
      cancelReset();
      showError('login-error', 'Password updated. Sign in with your new password.');
    } catch (err) {
      showError('reset-error', err.message);
    } finally {
      setLoading('reset-label', 'reset-loader', 'reset-submit', false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    hideError('reg-error');

    const username = document.getElementById('reg-username').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const bio = document.getElementById('reg-bio').value.trim();
    const password = document.getElementById('reg-password').value;
    const password2 = document.getElementById('reg-password2').value;

    if (password !== password2) {
      showError('reg-error', 'Passwords do not match');
      return;
    }

    setLoading('reg-label', 'reg-loader', 'reg-submit', true);

    try {
      const { publicKey, secretKey } = Crypto.generateKeyPair();
      const { token, user, sessionId } = await API.register(username, password, publicKey, bio, phone);
      Store.saveLocalKey(user.userId, user.username, publicKey, secretKey);
      Store.save({
        token,
        userId: user.userId,
        username: user.username,
        publicKey,
        secretKey,
        bio: user.bio || '',
        avatarHue: user.avatarHue || 260,
        profilePhoto: user.profilePhoto || '',
        phone: user.phone || phone || '',
        phoneVerified: Boolean(user.phoneVerified),
        twoFactorEnabled: Boolean(user.twoFactorEnabled),
        currentSessionId: sessionId || '',
      });
      App.navigate('userList');
    } catch (err) {
      showError('reg-error', err.message);
    } finally {
      setLoading('reg-label', 'reg-loader', 'reg-submit', false);
    }
  }

  return {
    render,
    switchTab,
    handleLogin,
    handleRegister,
    handleResetPassword,
    showReset,
    cancelReset,
    resetLoginOtp,
  };
})();
