/**
 * INDICANA discovery and profile sidebar
 */

const UserListUI = (() => {
  const usersById = new Map();
  let allUsers = [];
  let activeList = [];
  let selectedUserId = null;
  let searchToken = 0;
  let pendingProfilePhoto = null;
  let pendingPhoneVerification = null;

  function render() {
    const session = Store.get();

    return `
      <div class="app-layout">
        <aside class="sidebar">
          <div class="sidebar-header">
            <div class="sidebar-top">
              <button class="sidebar-identity identity-btn" type="button" onclick="UserListUI.openMyProfile()">
                <div class="my-avatar-wrap">
                  ${avatarMarkup(session, 'my-avatar')}
                  <div class="online-dot"></div>
                </div>
                <div>
                  <div class="sidebar-title" id="sidebar-title">${escapeHtml(session.username)}</div>
                  <div class="sidebar-sub">Your profile, messages, and calls</div>
                </div>
              </button>
              <div class="sidebar-actions">
                <button class="sidebar-mini-btn" type="button" onclick="UserListUI.openMyProfile()" title="My profile">Profile</button>
                <button class="btn-logout" onclick="App.logout()" title="Sign out">O</button>
              </div>
            </div>

            <div class="search-wrap">
              <span class="search-icon">⌕</span>
              <input id="user-search" type="text" placeholder="Search profiles by name..." oninput="UserListUI.handleSearchInput()" />
            </div>
          </div>

          <div class="user-list-wrap">
            <p class="list-label">People</p>
            <p class="search-help" id="search-help">Type at least 2 letters to search profiles.</p>
            <ul class="user-list" id="user-list">
              <li class="loading-item">Loading people...</li>
            </ul>
          </div>

          <div class="sidebar-footer">
            <span class="e2ee-badge">Locked with end-to-end encryption</span>
          </div>
        </aside>

        <main class="chat-pane" id="chat-pane">
          <div class="empty-state">
            <div class="empty-icon">◎</div>
            <h2>Find profiles and start sharing</h2>
            <p>Search by name, open a profile, then send messages, photos, camera shots, or start a call.</p>
          </div>
        </main>
      </div>
    `;
  }

  async function load() {
    try {
      const myProfile = await API.fetchMyProfile().catch(() => null);

      if (myProfile) {
        updateSessionProfile(myProfile);
      }

      allUsers = [];
      activeList = [];
      renderList(activeList);
    } catch (err) {
      const list = document.getElementById('user-list');
      if (list) list.innerHTML = `<li class="error-item">Failed to load: ${escapeHtml(err.message)}</li>`;
    }
  }

  async function handleSearchInput() {
    const input = document.getElementById('user-search');
    const help = document.getElementById('search-help');
    const query = input.value.trim();

    if (query.length < 2) {
      if (help) help.textContent = 'Type at least 2 letters to search profiles.';
      activeList = [];
      renderList(activeList);
      return;
    }

    if (help) help.textContent = `Searching for "${query}"...`;
    const currentSearch = ++searchToken;

    try {
      const results = await API.searchUsers(query);
      if (currentSearch !== searchToken) return;

      rememberUsers(results);
      activeList = sortUsers(results);
      if (help) {
        help.textContent = activeList.length
          ? `Found ${activeList.length} profile${activeList.length === 1 ? '' : 's'} for "${query}".`
          : `No profiles found for "${query}".`;
      }
      renderList(activeList);
    } catch (err) {
      if (currentSearch !== searchToken) return;
      const list = document.getElementById('user-list');
      if (help) help.textContent = 'Search is unavailable right now.';
      if (list) list.innerHTML = `<li class="error-item">Search failed: ${escapeHtml(err.message)}</li>`;
    }
  }

  function renderList(users) {
    const list = document.getElementById('user-list');
    if (!list) return;

    if (!users.length) {
      list.innerHTML = '<li class="empty-item">Search for a name to see matching profiles.</li>';
      return;
    }

    list.innerHTML = users.map((user) => {
      const preview = user.previewText || user.bio || 'Open profile and start chatting';
      const time = user.previewTime
        ? new Date(user.previewTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';

      return `
        <li class="user-item${user.userId === selectedUserId ? ' active' : ''}" id="user-item-${user.userId}" onclick="UserListUI.openProfile('${user.userId}')">
          <div class="user-avatar-wrap">
            ${avatarMarkup(user, 'user-avatar')}
          </div>
          <div class="user-info">
            <span class="user-name">${escapeHtml(user.username)}</span>
            <span class="user-preview" id="preview-${user.userId}">${escapeHtml(truncate(preview, 40))}</span>
          </div>
          <div class="user-side-meta">
            <span class="user-time" id="time-${user.userId}">${time}</span>
            <span class="user-unread${user.unreadCount ? ' active' : ''}" id="unread-${user.userId}">${user.unreadCount ? escapeHtml(String(user.unreadCount)) : ''}</span>
          </div>
        </li>
      `;
    }).join('');
  }

  async function openProfile(userId) {
    const user = usersById.get(userId);
    if (!user) return;

    selectedUserId = userId;
    highlightUser(userId);
    clearUnread(userId);
    await ChatUI.open(user);
  }

  async function openMyProfile() {
    clearSelection();
    const pane = document.getElementById('chat-pane');
    if (!pane) return;

    pane.innerHTML = '<div class="messages-loading">Loading your profile...</div>';

    try {
      const [profile, sessions, blockedUsers] = await Promise.all([
        API.fetchMyProfile(),
        API.listSessions().catch(() => []),
        API.listBlockedUsers().catch(() => []),
      ]);
      updateSessionProfile(profile);
      pane.innerHTML = renderMyProfilePane(profile, sessions, blockedUsers);
    } catch (err) {
      pane.innerHTML = `<div class="msg-error">Failed to load profile: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function saveMyProfile(event) {
    event.preventDefault();

    const bioInput = document.getElementById('profile-bio-input');
    const status = document.getElementById('profile-save-status');
    const profilePhoto = pendingProfilePhoto !== null
      ? pendingProfilePhoto
      : (Store.get().profilePhoto || '');

    if (status) {
      status.textContent = 'Saving changes...';
      status.classList.remove('error');
      status.classList.remove('muted');
    }

    try {
      const profile = await API.updateMyProfile({
        bio: bioInput ? bioInput.value.trim() : '',
        profilePhoto,
        twoFactorEnabled: document.getElementById('profile-2fa-toggle')?.checked || false,
      });

      pendingProfilePhoto = null;
      updateSessionProfile(profile);
      await refreshMyProfile('Profile updated');
    } catch (err) {
      if (status) {
        status.textContent = err.message;
        status.classList.add('error');
      }
    }
  }

  function chooseProfilePhoto() {
    const input = document.getElementById('profile-photo-input');
    if (input) input.click();
  }

  async function handleProfilePhotoInput(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;

    try {
      pendingProfilePhoto = await resizeProfilePhoto(file);
      const preview = document.getElementById('profile-photo-preview');
      if (preview) preview.innerHTML = avatarMarkup({ ...Store.get(), profilePhoto: pendingProfilePhoto }, 'profile-avatar');
    } catch (err) {
      const status = document.getElementById('profile-save-status');
      if (status) {
        status.textContent = err.message;
        status.classList.add('error');
      }
    }
  }

  function removeProfilePhoto() {
    pendingProfilePhoto = '';
    const preview = document.getElementById('profile-photo-preview');
    if (preview) preview.innerHTML = avatarMarkup({ ...Store.get(), profilePhoto: '' }, 'profile-avatar');
  }

  async function sendPhoneOtp() {
    const phone = document.getElementById('profile-phone-input')?.value.trim() || '';
    const status = document.getElementById('profile-security-status');
    if (!phone) {
      if (status) {
        status.textContent = 'Enter a phone number first.';
        status.classList.add('error');
      }
      return;
    }

    try {
      if (status) {
        status.textContent = 'Sending OTP...';
        status.classList.remove('error');
      }
      await API.sendPhoneOtp(phone);
      pendingPhoneVerification = phone;
      document.getElementById('profile-otp-row')?.classList.remove('hidden');
      if (status) {
        status.textContent = 'OTP sent. In dev mode, check the backend console.';
        status.classList.remove('error');
      }
    } catch (err) {
      if (status) {
        status.textContent = err.message;
        status.classList.add('error');
      }
    }
  }

  async function verifyPhoneOtp() {
    const phone = pendingPhoneVerification || document.getElementById('profile-phone-input')?.value.trim() || '';
    const otp = document.getElementById('profile-otp-input')?.value.trim() || '';
    const status = document.getElementById('profile-security-status');

    try {
      if (status) {
        status.textContent = 'Verifying phone...';
        status.classList.remove('error');
      }
      await API.verifyPhoneOtp(phone, otp);
      const profile = await API.fetchMyProfile();
      updateSessionProfile(profile);
      pendingPhoneVerification = null;
      await refreshMyProfile('Phone verified successfully');
    } catch (err) {
      if (status) {
        status.textContent = err.message;
        status.classList.add('error');
      }
    }
  }

  async function revokeSession(sessionId) {
    try {
      await API.revokeSession(sessionId);
      await refreshMyProfile('Session removed');
    } catch (err) {
      const status = document.getElementById('profile-security-status');
      if (status) {
        status.textContent = err.message;
        status.classList.add('error');
      }
    }
  }

  async function unblockUser(userId) {
    try {
      await API.unblockUser(userId);
      await refreshMyProfile('User unblocked');
    } catch (err) {
      const status = document.getElementById('profile-security-status');
      if (status) {
        status.textContent = err.message;
        status.classList.add('error');
      }
    }
  }

  async function refreshMyProfile(notice = '') {
    const pane = document.getElementById('chat-pane');
    if (!pane) return;

    const [profile, sessions, blockedUsers] = await Promise.all([
      API.fetchMyProfile(),
      API.listSessions().catch(() => []),
      API.listBlockedUsers().catch(() => []),
    ]);
    updateSessionProfile(profile);
    pane.innerHTML = renderMyProfilePane(profile, sessions, blockedUsers, notice);
  }

  function renderMyProfilePane(profile, sessions = [], blockedUsers = [], notice = '') {
    const isPhoneVerified = Boolean(profile.phoneVerified);
    const securityNotice = isPhoneVerified
      ? (profile.twoFactorEnabled ? '2FA is enabled for this account.' : 'Phone verified. You can enable 2FA below.')
      : 'Add and verify a phone number to enable 2FA login.';
    const sessionsMarkup = sessions.length
      ? sessions.map((session) => `
          <div class="session-item">
            <div>
              <strong>${escapeHtml(session.deviceName || 'Browser session')}</strong>
              <p>${escapeHtml(session.ipAddress || 'Unknown IP')} · Last active ${formatDateTime(session.lastSeenAt)}</p>
            </div>
            ${session.isCurrent
              ? '<span class="profile-chip subtle">Current</span>'
              : `<button class="btn-secondary" type="button" onclick="UserListUI.revokeSession('${session.sessionId}')">Sign out</button>`}
          </div>
        `).join('')
      : '<div class="empty-inline">No active sessions found.</div>';
    const blockedMarkup = blockedUsers.length
      ? blockedUsers.map((user) => `
          <div class="session-item">
            <div class="session-user">
              ${avatarMarkup(user, 'mini-avatar')}
              <div>
                <strong>${escapeHtml(user.username)}</strong>
                <p>${escapeHtml(user.bio || 'Blocked user')}</p>
              </div>
            </div>
            <button class="btn-secondary" type="button" onclick="UserListUI.unblockUser('${user.userId}')">Unblock</button>
          </div>
        `).join('')
      : '<div class="empty-inline">No blocked users.</div>';

    return `
      <section class="profile-pane">
        <div class="profile-hero">
          <div class="profile-avatar-stack" id="profile-photo-preview">
            ${avatarMarkup(profile, 'profile-avatar')}
          </div>
          <div class="profile-main">
            <div class="profile-title-row">
              <h2>@${escapeHtml(profile.username)}</h2>
              <div class="profile-chip">Your profile</div>
            </div>
            <div class="profile-stats">
              <span><strong>${profile.followersCount || 0}</strong> followers</span>
              <span><strong>${profile.followingCount || 0}</strong> following</span>
            </div>
            <p class="profile-bio-text">${escapeHtml(profile.bio || 'Add a bio so people know who you are.')}</p>
          </div>
        </div>

        <form class="profile-editor" onsubmit="UserListUI.saveMyProfile(event)">
          <input id="profile-photo-input" class="file-input" type="file" accept="image/*" onchange="UserListUI.handleProfilePhotoInput(event)" />

          <div class="profile-editor-actions">
            <button class="btn-secondary" type="button" onclick="UserListUI.chooseProfilePhoto()">Change photo</button>
            <button class="btn-secondary" type="button" onclick="UserListUI.removeProfilePhoto()">Remove photo</button>
          </div>

          <label class="profile-field">
            <span>Bio</span>
            <textarea id="profile-bio-input" maxlength="160" rows="4" placeholder="Write something about yourself...">${escapeHtml(profile.bio || '')}</textarea>
          </label>

          <div class="profile-save-row">
            <button class="btn-primary" type="submit">Save profile</button>
            <span class="profile-save-status${notice ? '' : ' muted'}" id="profile-save-status">${escapeHtml(notice || 'Your changes stay on this device and account.')}</span>
          </div>
        </form>

        <section class="profile-editor security-panel">
          <div class="profile-title-row">
            <h3>Security</h3>
            <div class="profile-chip${isPhoneVerified ? ' subtle' : ''}">${isPhoneVerified ? 'Verified phone' : 'Verification needed'}</div>
          </div>

          <label class="profile-field">
            <span>Phone Number</span>
            <input id="profile-phone-input" type="text" class="profile-input" placeholder="+919876543210" value="${escapeHtml(profile.phone || '')}" />
          </label>

          <div class="profile-editor-actions">
            <button class="btn-secondary" type="button" onclick="UserListUI.sendPhoneOtp()">Send OTP</button>
          </div>

          <div class="profile-otp-row${pendingPhoneVerification ? '' : ' hidden'}" id="profile-otp-row">
            <label class="profile-field">
              <span>Verify OTP</span>
              <input id="profile-otp-input" type="text" class="profile-input" maxlength="6" placeholder="Enter 6-digit code" />
            </label>
            <button class="btn-secondary" type="button" onclick="UserListUI.verifyPhoneOtp()">Verify Phone</button>
          </div>

          <label class="toggle-row${isPhoneVerified ? '' : ' disabled'}">
            <div>
              <strong>Two-Factor Authentication</strong>
              <p>${escapeHtml(securityNotice)}</p>
            </div>
            <input id="profile-2fa-toggle" type="checkbox" ${profile.twoFactorEnabled ? 'checked' : ''} ${isPhoneVerified ? '' : 'disabled'} />
          </label>

          <div class="security-checklist">
            <div>Login throttling is active after repeated failed sign-in attempts.</div>
            <div>Phone verification is required before enabling 2FA.</div>
            <div>OTP resend is rate-limited to slow down abuse.</div>
            <div>Encrypted chats stay protected, and private keys remain on this device.</div>
          </div>

          <span class="profile-save-status muted" id="profile-security-status">${escapeHtml(securityNotice)}</span>
        </section>

        <section class="profile-editor security-panel">
          <div class="profile-title-row">
            <h3>Active Sessions</h3>
            <div class="profile-chip subtle">${sessions.length} device${sessions.length === 1 ? '' : 's'}</div>
          </div>
          <div class="session-list">
            ${sessionsMarkup}
          </div>
        </section>

        <section class="profile-editor security-panel">
          <div class="profile-title-row">
            <h3>Blocked Users</h3>
            <div class="profile-chip">${blockedUsers.length} blocked</div>
          </div>
          <div class="session-list">
            ${blockedMarkup}
          </div>
        </section>
      </section>
    `;
  }

  function highlightUser(userId) {
    selectedUserId = userId;
    document.querySelectorAll('.user-item').forEach((element) => element.classList.remove('active'));
    const row = document.getElementById(`user-item-${userId}`);
    if (row) row.classList.add('active');
  }

  function clearSelection() {
    selectedUserId = null;
    document.querySelectorAll('.user-item').forEach((element) => element.classList.remove('active'));
  }

  function updatePreview(userId, text, time) {
    const user = usersById.get(userId);
    if (!user) return;

    user.previewText = text;
    user.previewTime = time;
    usersById.set(userId, user);

    const preview = document.getElementById(`preview-${userId}`);
    const timeEl = document.getElementById(`time-${userId}`);
    if (preview) preview.textContent = truncate(text, 40);
    if (timeEl && time) {
      timeEl.textContent = new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  }

  function incrementUnread(userId) {
    const user = usersById.get(userId);
    if (!user) return;

    user.unreadCount = (user.unreadCount || 0) + 1;
    usersById.set(userId, user);
    updateUnreadBadge(userId, user.unreadCount);
  }

  function clearUnread(userId) {
    const user = usersById.get(userId);
    if (!user) return;

    user.unreadCount = 0;
    usersById.set(userId, user);
    updateUnreadBadge(userId, 0);
  }

  function updateUnreadBadge(userId, unreadCount) {
    const badge = document.getElementById(`unread-${userId}`);
    if (!badge) return;

    badge.textContent = unreadCount ? String(unreadCount) : '';
    badge.classList.toggle('active', Boolean(unreadCount));
  }

  function rememberUser(user) {
    const existing = usersById.get(user.userId) || {};
    usersById.set(user.userId, {
      ...existing,
      ...user,
      bio: user.bio || existing.bio || '',
      profilePhoto: user.profilePhoto || existing.profilePhoto || '',
      avatarHue: user.avatarHue ?? existing.avatarHue ?? 260,
      isFollowing: user.isFollowing ?? existing.isFollowing ?? false,
      hasBlocked: user.hasBlocked ?? existing.hasBlocked ?? false,
      blockedByUser: user.blockedByUser ?? existing.blockedByUser ?? false,
      followersCount: user.followersCount ?? existing.followersCount ?? 0,
      followingCount: user.followingCount ?? existing.followingCount ?? 0,
      unreadCount: user.unreadCount ?? existing.unreadCount ?? 0,
    });
  }

  function rememberUsers(users) {
    users.forEach(rememberUser);
  }

  function getUserById(userId) {
    return usersById.get(userId) || null;
  }

  function sortUsers(users) {
    return [...users].sort((a, b) => a.username.localeCompare(b.username));
  }

  function updateSessionProfile(profile) {
    Store.patch({
      bio: profile.bio || '',
      phone: profile.phone || '',
      profilePhoto: profile.profilePhoto || '',
      avatarHue: profile.avatarHue ?? Store.get()?.avatarHue ?? 260,
      phoneVerified: Boolean(profile.phoneVerified),
      twoFactorEnabled: Boolean(profile.twoFactorEnabled),
    });

    const title = document.getElementById('sidebar-title');
    if (title) title.textContent = profile.username || Store.get().username;

    const avatarWrap = document.querySelector('.my-avatar-wrap');
    if (avatarWrap) {
      avatarWrap.innerHTML = `
        ${avatarMarkup({ ...Store.get(), ...profile }, 'my-avatar')}
        <div class="online-dot"></div>
      `;
    }
  }

  async function resizeProfilePhoto(file) {
    const dataUrl = await readFileAsDataUrl(file);
    return resizeDataUrl(dataUrl, 640, 0.82, 1_500_000);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read the selected image.'));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not load the selected image.'));
      image.src = src;
    });
  }

  async function resizeDataUrl(dataUrl, maxEdge, quality, maxLength) {
    const image = await loadImage(dataUrl);
    const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, width, height);

    const output = canvas.toDataURL('image/jpeg', quality);
    if (output.length > maxLength) {
      throw new Error('Profile photo is too large. Try a smaller image.');
    }
    return output;
  }

  function avatarMarkup(user, className) {
    const initial = escapeHtml((user.username || '?').charAt(0).toUpperCase());
    if (user.profilePhoto) {
      return `
        <div class="${className} avatar-shell">
          <img class="avatar-image" src="${escapeAttribute(user.profilePhoto)}" alt="${escapeHtml(user.username || 'Profile photo')}" />
        </div>
      `;
    }

    return `<div class="${className} avatar-shell" style="${avatarStyle(user.avatarHue)}">${initial}</div>`;
  }

  function truncate(text, max) {
    return text.length > max ? `${text.slice(0, max - 1)}...` : text;
  }

  function avatarStyle(hue = 260) {
    return `background: linear-gradient(135deg, hsl(${hue} 76% 58%), hsl(${(hue + 38) % 360} 85% 53%));`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function formatDateTime(value) {
    if (!value) return 'unknown';
    return new Date(value).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return {
    render,
    load,
    handleSearchInput,
    openProfile,
    openMyProfile,
    saveMyProfile,
    sendPhoneOtp,
    verifyPhoneOtp,
    revokeSession,
    unblockUser,
    chooseProfilePhoto,
    handleProfilePhotoInput,
    removeProfilePhoto,
    highlightUser,
    clearSelection,
    updatePreview,
    incrementUnread,
    clearUnread,
    rememberUser,
    rememberUsers,
    getUserById,
  };
})();
