/**
 * INDICANA chat, profiles, media, camera, and calling UI
 */

const ChatUI = (() => {
  let peer = null;
  const EMOJIS = [
    '😀', '😂', '😍', '🥰', '😎', '😭', '😴', '🤔', '🔥', '✨',
    '❤️', '💙', '💯', '🎉', '🙏', '👍', '👀', '🤝', '👏', '🙌',
    '😘', '😅', '🥳', '😇', '😡', '🤍', '🌙', '☀️', '🌸', '🎵',
  ];

  const callState = {
    iceServers: null,
    peerConnection: null,
    localStream: null,
    remoteStream: null,
    pendingOffer: null,
    pendingCandidates: [],
    mode: 'video',
    incoming: false,
    status: '',
  };

  let cameraStream = null;

  async function open(user) {
    if (peer && peer.userId !== user.userId && (callState.peerConnection || callState.localStream || callState.remoteStream)) {
      await endCall();
    }

    let fullProfile = user;
    try {
      fullProfile = await API.fetchProfile(user.userId);
    } catch (err) {
      if (err.message.includes('unavailable')) {
        const pane = document.getElementById('chat-pane');
        if (pane) pane.innerHTML = `<div class="msg-error">${escapeHtml(err.message)}</div>`;
        return;
      }
    }

    peer = { ...user, ...fullProfile };
    UserListUI.rememberUser(peer);
    UserListUI.highlightUser(peer.userId);

    const pane = document.getElementById('chat-pane');
    pane.innerHTML = renderPane(peer);

    const input = document.getElementById('msg-input');
    if (input) input.focus();

    updateCallUI();
    await loadHistory();
  }

  function renderPane(activePeer) {
    return `
      <div class="chat-header">
        <div class="peer-avatar-wrap">
          ${avatarMarkup(activePeer, 'peer-avatar')}
        </div>
        <div class="peer-info">
          <span class="peer-name">${escapeHtml(activePeer.username)}</span>
          <span class="peer-secure">${escapeHtml(activePeer.bio || 'No bio yet')}</span>
        </div>
        <div class="chat-actions">
          <button class="action-btn" title="Voice call" onclick="ChatUI.startVoiceCall()">☎</button>
          <button class="action-btn" title="Video call" onclick="ChatUI.startVideoCall()">◉</button>
        </div>
      </div>

      <section class="profile-summary" id="profile-summary">
        ${profileSummaryMarkup(activePeer)}
      </section>

      <div class="call-banner" id="call-banner">
        <div>
          <strong id="call-banner-title">Incoming call</strong>
          <p id="call-banner-text">Someone is calling you.</p>
        </div>
        <div class="call-banner-actions">
          <button class="btn-secondary" onclick="ChatUI.declineIncomingCall()">Decline</button>
          <button class="btn-accept" onclick="ChatUI.acceptIncomingCall()">Accept</button>
        </div>
      </div>

      <div class="messages-wrap" id="messages-wrap">
        <div class="messages-list" id="messages-list">
          <div class="messages-loading">Loading messages...</div>
        </div>
      </div>

      <form class="composer" id="composer" onsubmit="ChatUI.sendMessage(event)">
        <input id="photo-input" class="file-input" type="file" accept="image/png,image/jpeg,image/webp,image/jpg" onchange="ChatUI.handleAttachment(event)" />
        <input id="gif-file-input" class="file-input" type="file" accept="image/gif" onchange="ChatUI.handleGifFile(event)" />
        <div class="composer-input-wrap">
          <div class="composer-tools">
            <button type="button" class="tool-btn" title="Emoji" onclick="ChatUI.toggleEmojiPicker()">☺</button>
            <button type="button" class="tool-btn" title="Share photo" onclick="ChatUI.openAttachmentPicker()">+</button>
            <button type="button" class="tool-btn gif-tool-btn" title="Share GIF" onclick="ChatUI.openGifModal()">GIF</button>
            <button type="button" class="tool-btn" title="Use camera" onclick="ChatUI.openCamera()">O</button>
          </div>
          <textarea
            id="msg-input"
            class="msg-input"
            placeholder="Send a message or add a caption..."
            rows="1"
            maxlength="4000"
            onkeydown="ChatUI.handleKey(event)"
            oninput="ChatUI.autoResize(this)"
          ></textarea>
        </div>
        <button type="submit" class="btn-send" id="btn-send" title="Send">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </form>

      <div class="emoji-drawer" id="emoji-drawer">
        ${emojiPickerMarkup()}
      </div>

      <div class="gif-modal" id="gif-modal">
        <div class="gif-card">
          <button class="camera-close" type="button" onclick="ChatUI.closeGifModal()">x</button>
          <div class="gif-header">
            <h3>Share a GIF</h3>
            <p>Paste a direct GIF URL or upload a local GIF file.</p>
          </div>
          <label class="profile-field">
            <span>GIF URL</span>
            <input id="gif-url-input" class="profile-input" type="url" placeholder="https://media.tenor.com/...gif" />
          </label>
          <div class="gif-actions">
            <button class="btn-secondary" type="button" onclick="ChatUI.openGifFilePicker()">Upload GIF</button>
            <button class="btn-primary" type="button" onclick="ChatUI.sendGifFromUrl()">Send GIF</button>
          </div>
        </div>
      </div>

      <div class="camera-modal" id="camera-modal">
        <div class="camera-card">
          <button class="camera-close" type="button" onclick="ChatUI.closeCamera()">x</button>
          <video id="camera-video" class="camera-video" autoplay playsinline muted></video>
          <div class="camera-actions">
            <button class="btn-secondary" type="button" onclick="ChatUI.closeCamera()">Cancel</button>
            <button class="btn-primary camera-shot" type="button" onclick="ChatUI.captureCamera()">Capture</button>
          </div>
        </div>
      </div>

      <div class="call-overlay" id="call-overlay">
        <div class="call-grid">
          <div class="call-video-card">
            <video id="remote-video" class="call-video" autoplay playsinline></video>
            <div class="call-fallback" id="remote-fallback">${escapeHtml(activePeer.username.charAt(0).toUpperCase())}</div>
            <span class="call-label">${escapeHtml(activePeer.username)}</span>
          </div>
          <div class="call-video-card local">
            <video id="local-video" class="call-video" autoplay playsinline muted></video>
            <div class="call-fallback" id="local-fallback">You</div>
            <span class="call-label">You</span>
          </div>
        </div>

        <div class="call-details">
          <h3 id="call-title">${escapeHtml(activePeer.username)}</h3>
          <p id="call-status">Ready to call</p>
        </div>

        <div class="call-controls">
          <button class="btn-secondary" type="button" onclick="ChatUI.closeCallPanel()">Hide</button>
          <button class="btn-end" type="button" onclick="ChatUI.endCall()">End call</button>
        </div>
      </div>
    `;
  }

  function profileSummaryMarkup(activePeer) {
    if (activePeer.blockedByUser) {
      return `
        <div class="profile-blocked-state">
          <strong>This profile is unavailable.</strong>
          <p>You cannot message or follow this user right now.</p>
        </div>
      `;
    }

    const badge = activePeer.followsYou ? '<span class="profile-chip subtle">Follows you</span>' : '';
    const followAction = activePeer.isFollowing
      ? '<button class="btn-secondary" type="button" onclick="ChatUI.toggleFollow()">Following</button>'
      : '<button class="btn-primary profile-follow-btn" type="button" onclick="ChatUI.toggleFollow()">Follow</button>';
    const blockAction = activePeer.hasBlocked
      ? '<button class="btn-secondary" type="button" onclick="ChatUI.toggleBlock()">Unblock</button>'
      : '<button class="btn-secondary" type="button" onclick="ChatUI.toggleBlock()">Block</button>';

    return `
      <div class="profile-summary-top">
        <div class="profile-summary-avatar">
          ${avatarMarkup(activePeer, 'profile-summary-avatar-shell')}
        </div>
        <div class="profile-summary-main">
          <div class="profile-title-row">
            <h3>@${escapeHtml(activePeer.username)}</h3>
            ${badge}
          </div>
          <div class="profile-stats">
            <span><strong>${activePeer.followersCount || 0}</strong> followers</span>
            <span><strong>${activePeer.followingCount || 0}</strong> following</span>
          </div>
          <p class="profile-bio-text">${escapeHtml(activePeer.bio || 'No bio yet')}</p>
        </div>
      </div>
      <div class="profile-summary-actions">
        ${activePeer.hasBlocked ? '<button class="btn-secondary" type="button" disabled>Messaging blocked</button>' : followAction}
        ${blockAction}
        <button class="btn-secondary" type="button" onclick="ChatUI.reportUser()">Report</button>
        <button class="btn-secondary" type="button" onclick="document.getElementById('msg-input').focus()" ${activePeer.hasBlocked ? 'disabled' : ''}>Message</button>
      </div>
    `;
  }

  function emojiPickerMarkup() {
    return `
      <div class="emoji-grid">
        ${EMOJIS.map((emoji) => `
          <button type="button" class="emoji-btn-tile" onclick="ChatUI.insertEmoji('${emoji}')">${emoji}</button>
        `).join('')}
      </div>
    `;
  }

  async function toggleFollow() {
    if (!peer) return;

    try {
      if (peer.isFollowing) {
        await API.unfollowUser(peer.userId);
      } else {
        await API.followUser(peer.userId);
      }

      const freshProfile = await API.fetchProfile(peer.userId);
      peer = { ...peer, ...freshProfile };
      UserListUI.rememberUser(peer);
      updateProfileSummary();
    } catch (err) {
      alert(`Follow update failed: ${err.message}`);
    }
  }

  async function toggleBlock() {
    if (!peer) return;

    try {
      if (peer.hasBlocked) {
        await API.unblockUser(peer.userId);
      } else {
        const confirmed = window.confirm(`Block @${peer.username}? You will stop messages and follows.`);
        if (!confirmed) return;
        await API.blockUser(peer.userId);
      }

      const freshProfile = await API.fetchProfile(peer.userId).catch(() => null);
      peer = freshProfile ? { ...peer, ...freshProfile } : { ...peer, hasBlocked: !peer.hasBlocked };
      UserListUI.rememberUser(peer);
      updateProfileSummary();

      if (peer.hasBlocked) {
        const list = document.getElementById('messages-list');
        if (list) list.innerHTML = '<div class="msg-error">You blocked this user. Unblock them to chat again.</div>';
      } else {
        await loadHistory();
      }
    } catch (err) {
      alert(`Block update failed: ${err.message}`);
    }
  }

  async function reportUser() {
    if (!peer) return;
    const reason = window.prompt(`Report @${peer.username}. Briefly tell us why:`, 'Spam or abusive behavior');
    if (!reason) return;

    try {
      await API.reportUser(peer.userId, reason);
      alert('Report submitted.');
    } catch (err) {
      alert(`Report failed: ${err.message}`);
    }
  }

  function updateProfileSummary() {
    const summary = document.getElementById('profile-summary');
    if (summary && peer) {
      summary.innerHTML = profileSummaryMarkup(peer);
    }

    const headerWrap = document.querySelector('.chat-header .peer-avatar-wrap');
    if (headerWrap && peer) {
      headerWrap.innerHTML = avatarMarkup(peer, 'peer-avatar');
    }

    const secure = document.querySelector('.chat-header .peer-secure');
    if (secure && peer) {
      secure.textContent = peer.bio || 'No bio yet';
    }
  }

  async function loadHistory() {
    const session = Store.get();
    const list = document.getElementById('messages-list');
    if (!list || !peer) return;

    try {
      const messages = await API.fetchMessages(session.userId, peer.userId);
      list.innerHTML = '';
      messages.forEach((message, index) => {
        appendMessage(message, session, messages[index - 1]);
      });
      scrollToBottom();
      API.markConversationSeen(peer.userId).catch(() => {});
    } catch (err) {
      list.innerHTML = `<div class="msg-error">Failed to load: ${escapeHtml(err.message)}</div>`;
    }
  }

  function appendMessage(message, session, previousMessage) {
    const list = document.getElementById('messages-list');
    if (!list || !peer) return;

    const isMine = message.senderId === session.userId;
    const direction = isMine ? 'out' : 'in';

    let plaintext = null;
    try {
      plaintext = Crypto.decryptMessage(message.ciphertext, message.nonce, peer.publicKey, session.secretKey);
    } catch {
      plaintext = null;
    }

    const payload = plaintext !== null ? decodePayload(plaintext, message.type) : null;
    const content = payload
      ? renderPayload(payload)
      : '<span class="decrypt-fail">Could not decrypt this message</span>';
    const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const sameAsPrevious = previousMessage && previousMessage.senderId === message.senderId;

    const row = document.createElement('div');
    row.className = `msg-row ${direction}${sameAsPrevious && !isMine ? ' consecutive' : ''}`;
    row.dataset.nonce = message.nonce;
    row.dataset.clientId = message.clientId || '';

    row.innerHTML = `
      ${!isMine ? avatarMarkup(peer, 'msg-row-avatar') : ''}
      <div class="msg-bubble">
        <div class="msg-content">${content}</div>
        <div class="msg-meta">
          <span class="msg-time">${time}</span>
          ${isMine ? `<span class="msg-seen">${getStatusLabel(message)}</span>` : ''}
        </div>
      </div>
    `;

    list.appendChild(row);
    if (payload) UserListUI.updatePreview(peer.userId, previewText(payload), message.timestamp);
  }

  async function sendMessage(event) {
    event.preventDefault();
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text || !peer) return;

    input.value = '';
    autoResize(input);
    await sendPayload({ kind: 'text', text }, 'text');
  }

  async function sendPayload(payload, type) {
    const session = Store.get();
    const clientId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let encrypted;

    try {
      encrypted = Crypto.encryptMessage(JSON.stringify(payload), peer.publicKey, session.secretKey);
    } catch (err) {
      alert(`Encryption error: ${err.message}`);
      return;
    }

    const optimistic = {
      senderId: session.userId,
      receiverId: peer.userId,
      clientId,
      type,
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      timestamp: new Date().toISOString(),
      deliveredAt: null,
      seenAt: null,
    };

    const list = document.getElementById('messages-list');
    const lastRow = list ? list.lastElementChild : null;
    const previousMessage = lastRow
      ? { senderId: lastRow.classList.contains('out') ? session.userId : peer.userId }
      : null;

    appendMessage(optimistic, session, previousMessage);
    scrollToBottom();

    try {
      const saved = await API.sendMessage(peer.userId, clientId, encrypted.ciphertext, encrypted.nonce, type);
      updateMessageStatus(saved);
    } catch {
      const rows = document.querySelectorAll('.msg-row.out');
      if (!rows.length) return;
      const last = rows[rows.length - 1];
      last.classList.add('msg-failed');
      const meta = last.querySelector('.msg-meta');
      if (meta) meta.innerHTML += ' <span class="msg-fail-label">Not sent</span>';
    }
  }

  function handleKey(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      document.getElementById('composer').dispatchEvent(new Event('submit'));
    }
  }

  function autoResize(element) {
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 140)}px`;
  }

  function toggleEmojiPicker() {
    const drawer = document.getElementById('emoji-drawer');
    if (!drawer) return;

    drawer.classList.toggle('open');
    closeGifModal();
  }

  function insertEmoji(emoji) {
    const input = document.getElementById('msg-input');
    if (!input) return;

    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = `${input.value.slice(0, start)}${emoji}${input.value.slice(end)}`;
    input.focus();
    const caret = start + emoji.length;
    input.setSelectionRange(caret, caret);
    autoResize(input);
  }

  function openAttachmentPicker() {
    const input = document.getElementById('photo-input');
    if (input) input.click();
  }

  async function handleAttachment(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file || !peer) return;

    try {
      const imageData = await fileToResizedDataUrl(file);
      const caption = getComposerText();
      clearComposer();
      await sendPayload({ kind: 'image', imageData, caption }, 'image');
    } catch (err) {
      alert(`Photo share failed: ${err.message}`);
    }
  }

  function openGifModal() {
    const modal = document.getElementById('gif-modal');
    if (modal) modal.classList.add('open');

    const drawer = document.getElementById('emoji-drawer');
    if (drawer) drawer.classList.remove('open');
  }

  function closeGifModal() {
    const modal = document.getElementById('gif-modal');
    if (modal) modal.classList.remove('open');
  }

  function openGifFilePicker() {
    const input = document.getElementById('gif-file-input');
    if (input) input.click();
  }

  async function sendGifFromUrl() {
    const input = document.getElementById('gif-url-input');
    const gifUrl = input ? input.value.trim() : '';
    if (!gifUrl) {
      alert('Paste a GIF URL first.');
      return;
    }

    if (!isLikelyGifUrl(gifUrl)) {
      alert('Use a direct GIF URL that starts with http or https.');
      return;
    }

    const caption = getComposerText();
    clearComposer();
    if (input) input.value = '';
    closeGifModal();
    await sendPayload({ kind: 'gif', gifUrl, caption }, 'image');
  }

  async function handleGifFile(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file || !peer) return;

    try {
      const gifData = await fileToGifDataUrl(file);
      const caption = getComposerText();
      clearComposer();
      closeGifModal();
      await sendPayload({ kind: 'gif', gifData, caption }, 'image');
    } catch (err) {
      alert(`GIF share failed: ${err.message}`);
    }
  }

  async function openCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Camera access is not supported in this browser.');
      return;
    }

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });

      const modal = document.getElementById('camera-modal');
      const video = document.getElementById('camera-video');
      if (video) video.srcObject = cameraStream;
      if (modal) modal.classList.add('open');
    } catch (err) {
      alert(`Camera could not start: ${err.message}`);
    }
  }

  function closeCamera() {
    stopStream(cameraStream);
    cameraStream = null;

    const modal = document.getElementById('camera-modal');
    const video = document.getElementById('camera-video');
    if (video) video.srcObject = null;
    if (modal) modal.classList.remove('open');
  }

  async function captureCamera() {
    const video = document.getElementById('camera-video');
    if (!video || !cameraStream) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 960;

    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = await resizeDataUrl(canvas.toDataURL('image/jpeg', 0.86), 1200, 0.84);
    const caption = getComposerText();
    clearComposer();
    closeCamera();
    await sendPayload({ kind: 'image', imageData, caption }, 'image');
  }

  async function startVoiceCall() {
    await startCall('voice');
  }

  async function startVideoCall() {
    await startCall('video');
  }

  async function startCall(mode) {
    if (!peer) return;

    try {
      await ensureRtcConfig();
      await resetCall(false);
      await prepareLocalMedia(mode);
      createPeerConnection(mode);

      const offer = await callState.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: mode === 'video',
      });

      await callState.peerConnection.setLocalDescription(offer);
      callState.mode = mode;
      callState.status = mode === 'video' ? 'Calling with video...' : 'Calling with audio...';
      callState.incoming = false;
      updateCallUI();

      API.sendCallSignal(peer.userId, {
        signalType: 'offer',
        mode,
        description: offer,
      });
    } catch (err) {
      await resetCall(false);
      alert(`Call could not start: ${err.message}`);
    }
  }

  async function acceptIncomingCall() {
    if (!peer || !callState.pendingOffer) return;

    try {
      await ensureRtcConfig();
      await prepareLocalMedia(callState.mode);
      createPeerConnection(callState.mode);
      await callState.peerConnection.setRemoteDescription(callState.pendingOffer);
      await flushPendingCandidates();

      const answer = await callState.peerConnection.createAnswer();
      await callState.peerConnection.setLocalDescription(answer);

      API.sendCallSignal(peer.userId, {
        signalType: 'answer',
        mode: callState.mode,
        description: answer,
      });

      callState.pendingOffer = null;
      callState.incoming = false;
      callState.status = 'Connecting...';
      updateCallUI();
    } catch (err) {
      await resetCall(false);
      alert(`Call could not be answered: ${err.message}`);
    }
  }

  async function declineIncomingCall() {
    if (peer) {
      try {
        API.sendCallSignal(peer.userId, { signalType: 'decline' });
      } catch {
        // Ignore if realtime channel is offline.
      }
    }

    await resetCall(false);
    updateCallUI();
  }

  async function endCall(signalPeer = true) {
    if (signalPeer && peer) {
      try {
        API.sendCallSignal(peer.userId, { signalType: 'end' });
      } catch {
        // Ignore if realtime channel is offline.
      }
    }

    await resetCall(false);
    updateCallUI();
  }

  function closeCallPanel() {
    const overlay = document.getElementById('call-overlay');
    if (overlay) overlay.classList.remove('active');
  }

  function onSocketEvent(frame) {
    if (!frame || !frame.type) return;

    if (frame.type === 'NEW_MESSAGE' || frame.type === 'MESSAGE_SENT') {
      onIncomingMessage(frame.payload);
      return;
    }

    if (frame.type === 'MESSAGE_STATUS_UPDATE') {
      updateMessageStatus(frame.payload);
      return;
    }

    if (frame.type === 'CALL_SIGNAL') {
      handleCallSignal(frame.payload);
    }
  }

  function onIncomingMessage(packet) {
    if (!packet) return;

    const session = Store.get();
    if (!session) return;

    if (packet.senderId !== session.userId && packet.senderId !== peer?.userId) {
      UserListUI.updatePreview(packet.senderId, packet.type === 'image' ? 'Photo' : 'New message', packet.timestamp);
      return;
    }

    const isRelevant = peer && (
      (packet.senderId === peer.userId && packet.receiverId === session.userId) ||
      (packet.senderId === session.userId && packet.receiverId === peer.userId)
    );

    if (!isRelevant) return;
    if (packet.senderId === session.userId) {
      const existing = document.querySelector(`.msg-row[data-nonce="${packet.nonce}"]`);
      if (existing) return;
    }

    const list = document.getElementById('messages-list');
    const lastRow = list ? list.lastElementChild : null;
    const previousMessage = lastRow
      ? { senderId: lastRow.classList.contains('out') ? session.userId : peer.userId }
      : null;

    appendMessage(packet, session, previousMessage);
    scrollToBottom();
    API.markConversationSeen(peer.userId).catch(() => {});
  }

  async function handleCallSignal(payload) {
    if (!payload || !payload.from) return;

    if (!peer || peer.userId !== payload.from) {
      let incomingPeer = UserListUI.getUserById(payload.from);
      if (!incomingPeer) {
        incomingPeer = await API.getPublicKey(payload.from);
        UserListUI.rememberUser(incomingPeer);
      }
      await open(incomingPeer);
    }

    switch (payload.signalType) {
      case 'offer':
        callState.pendingOffer = payload.description;
        callState.pendingCandidates = [];
        callState.mode = payload.mode || 'video';
        callState.incoming = true;
        callState.status = `Incoming ${callState.mode} call`;
        updateCallUI();
        break;

      case 'answer':
        if (!callState.peerConnection || !payload.description) return;
        await callState.peerConnection.setRemoteDescription(payload.description);
        await flushPendingCandidates();
        callState.status = 'Connected';
        updateCallUI();
        break;

      case 'ice-candidate':
        if (!payload.candidate) return;
        if (callState.peerConnection && callState.peerConnection.remoteDescription) {
          try {
            await callState.peerConnection.addIceCandidate(payload.candidate);
          } catch {
            // Ignore invalid candidates.
          }
        } else {
          callState.pendingCandidates.push(payload.candidate);
        }
        break;

      case 'decline':
        callState.status = 'Call declined';
        await resetCall(true);
        updateCallUI();
        break;

      case 'end':
        callState.status = 'Call ended';
        await resetCall(true);
        updateCallUI();
        break;

      default:
        break;
    }
  }

  async function ensureRtcConfig() {
    if (!callState.iceServers) {
      const config = await API.getRtcConfig();
      callState.iceServers = config.iceServers || [];
    }
  }

  async function prepareLocalMedia(mode) {
    stopStream(callState.localStream);
    callState.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: mode === 'video' ? { facingMode: 'user' } : false,
    });
    callState.mode = mode;
    updateCallUI();
  }

  function createPeerConnection(mode) {
    if (callState.peerConnection) {
      callState.peerConnection.close();
    }

    callState.remoteStream = new MediaStream();
    callState.peerConnection = new RTCPeerConnection({ iceServers: callState.iceServers });

    if (callState.localStream) {
      callState.localStream.getTracks().forEach((track) => {
        callState.peerConnection.addTrack(track, callState.localStream);
      });
    }

    callState.peerConnection.onicecandidate = (event) => {
      if (!event.candidate || !peer) return;
      try {
        API.sendCallSignal(peer.userId, {
          signalType: 'ice-candidate',
          candidate: event.candidate,
        });
      } catch {
        // Ignore if realtime channel is offline.
      }
    };

    callState.peerConnection.ontrack = (event) => {
      const [stream] = event.streams;
      callState.remoteStream = stream || callState.remoteStream;
      callState.status = 'Connected';
      updateCallUI();
    };

    callState.peerConnection.onconnectionstatechange = () => {
      const state = callState.peerConnection.connectionState;
      if (state === 'connected') {
        callState.status = 'Connected';
        updateCallUI();
      }

      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        callState.status = state === 'failed' ? 'Call failed' : 'Call ended';
        resetCall(true).then(updateCallUI);
      }
    };

    callState.status = mode === 'video' ? 'Starting video call...' : 'Starting voice call...';
    updateCallUI();
  }

  async function flushPendingCandidates() {
    while (callState.pendingCandidates.length && callState.peerConnection) {
      const candidate = callState.pendingCandidates.shift();
      try {
        await callState.peerConnection.addIceCandidate(candidate);
      } catch {
        // Ignore invalid candidates.
      }
    }
  }

  async function resetCall(keepStatus) {
    if (callState.peerConnection) {
      callState.peerConnection.onicecandidate = null;
      callState.peerConnection.ontrack = null;
      callState.peerConnection.onconnectionstatechange = null;
      callState.peerConnection.close();
    }

    stopStream(callState.localStream);
    stopStream(callState.remoteStream);

    callState.peerConnection = null;
    callState.localStream = null;
    callState.remoteStream = null;
    callState.pendingOffer = null;
    callState.pendingCandidates = [];
    callState.incoming = false;

    if (!keepStatus) {
      callState.status = '';
    }
  }

  function updateCallUI() {
    const banner = document.getElementById('call-banner');
    const bannerTitle = document.getElementById('call-banner-title');
    const bannerText = document.getElementById('call-banner-text');
    const overlay = document.getElementById('call-overlay');
    const title = document.getElementById('call-title');
    const status = document.getElementById('call-status');
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const localFallback = document.getElementById('local-fallback');
    const remoteFallback = document.getElementById('remote-fallback');

    if (!overlay || !status) return;

    const showOverlay = Boolean(callState.peerConnection || callState.localStream || callState.remoteStream || callState.status);
    overlay.classList.toggle('active', showOverlay);

    if (title && peer) title.textContent = peer.username;
    status.textContent = callState.status || 'Ready to call';

    if (banner) {
      banner.classList.toggle('active', callState.incoming);
      if (bannerTitle) bannerTitle.textContent = `Incoming ${callState.mode} call`;
      if (bannerText && peer) bannerText.textContent = `${peer.username} is calling you.`;
    }

    if (localVideo) localVideo.srcObject = callState.localStream || null;
    if (remoteVideo) remoteVideo.srcObject = callState.remoteStream || null;

    const hasLocalVideo = Boolean(callState.localStream && callState.localStream.getVideoTracks().length);
    const hasRemoteVideo = Boolean(callState.remoteStream && callState.remoteStream.getVideoTracks().length);

    if (localVideo) localVideo.classList.toggle('hidden', !hasLocalVideo);
    if (remoteVideo) remoteVideo.classList.toggle('hidden', !hasRemoteVideo);
    if (localFallback) localFallback.classList.toggle('hidden', hasLocalVideo);
    if (remoteFallback) remoteFallback.classList.toggle('hidden', hasRemoteVideo);
  }

  function decodePayload(plaintext, type) {
    try {
      const parsed = JSON.parse(plaintext);
      if (parsed && parsed.kind === 'image' && parsed.imageData) {
        return { kind: 'image', imageData: parsed.imageData, caption: parsed.caption || '' };
      }
      if (parsed && parsed.kind === 'gif' && (parsed.gifData || parsed.gifUrl)) {
        return {
          kind: 'gif',
          gifData: parsed.gifData || '',
          gifUrl: parsed.gifUrl || '',
          caption: parsed.caption || '',
        };
      }
      if (parsed && parsed.kind === 'text') {
        return { kind: 'text', text: parsed.text || '' };
      }
    } catch {
      // Fall through to legacy rendering.
    }

    if (type === 'image' && plaintext.startsWith('data:image/')) {
      return { kind: 'image', imageData: plaintext, caption: '' };
    }

    return { kind: 'text', text: plaintext };
  }

  function renderPayload(payload) {
    if (payload.kind === 'image') {
      return `
        <div class="msg-media">
          <img class="msg-image" src="${escapeAttribute(payload.imageData)}" alt="Shared media" />
          ${payload.caption ? `<div class="msg-caption">${escapeHtml(payload.caption).replace(/\n/g, '<br>')}</div>` : ''}
        </div>
      `;
    }

    if (payload.kind === 'gif') {
      const source = payload.gifData || payload.gifUrl;
      return `
        <div class="msg-media">
          <img class="msg-image msg-gif" src="${escapeAttribute(source)}" alt="Shared GIF" />
          ${payload.caption ? `<div class="msg-caption">${escapeHtml(payload.caption).replace(/\n/g, '<br>')}</div>` : ''}
        </div>
      `;
    }

    return escapeHtml(payload.text).replace(/\n/g, '<br>');
  }

  function previewText(payload) {
    if (payload.kind === 'image') {
      return payload.caption ? `Photo: ${payload.caption}` : 'Photo';
    }
    if (payload.kind === 'gif') {
      return payload.caption ? `GIF: ${payload.caption}` : 'GIF';
    }
    return payload.text;
  }

  function updateMessageStatus(payload) {
    if (!payload) return;

    const rows = Array.from(document.querySelectorAll('.msg-row.out'));
    const row = rows.find((item) => item.dataset.nonce === payload.nonce || item.dataset.clientId === payload.clientId);
    if (!row) return;

    const badge = row.querySelector('.msg-seen');
    if (!badge) return;

    badge.textContent = getStatusLabel(payload);
  }

  function getStatusLabel(message) {
    if (message?.seenAt) return 'Seen';
    if (message?.deliveredAt) return 'Delivered';
    return 'Sent';
  }

  async function fileToResizedDataUrl(file) {
    const raw = await readFileAsDataUrl(file);
    return resizeDataUrl(raw, 1440, 0.84);
  }

  async function fileToGifDataUrl(file) {
    if (file.type !== 'image/gif') {
      throw new Error('Please choose a GIF file.');
    }

    const raw = await readFileAsDataUrl(file);
    if (raw.length > 8_000_000) {
      throw new Error('GIF is too large. Try one under 8 MB.');
    }
    return raw;
  }

  async function resizeDataUrl(dataUrl, maxEdge, quality) {
    const image = await loadImage(dataUrl);
    const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, width, height);

    const resized = canvas.toDataURL('image/jpeg', quality);
    if (resized.length > 5_000_000) {
      throw new Error('This image is still too large after compression.');
    }
    return resized;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('The selected file could not be read.'));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('The image could not be loaded.'));
      image.src = src;
    });
  }

  function isLikelyGifUrl(url) {
    return /^https?:\/\//i.test(url);
  }

  function getComposerText() {
    const input = document.getElementById('msg-input');
    return input ? input.value.trim() : '';
  }

  function clearComposer() {
    const input = document.getElementById('msg-input');
    if (!input) return;
    input.value = '';
    autoResize(input);
  }

  function scrollToBottom() {
    const wrap = document.getElementById('messages-wrap');
    if (wrap) wrap.scrollTop = wrap.scrollHeight;
  }

  function stopStream(stream) {
    if (!stream || !stream.getTracks) return;
    stream.getTracks().forEach((track) => track.stop());
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

  return {
    open,
    toggleFollow,
    toggleBlock,
    reportUser,
    sendMessage,
    handleKey,
    autoResize,
    toggleEmojiPicker,
    insertEmoji,
    openAttachmentPicker,
    handleAttachment,
    openGifModal,
    closeGifModal,
    openGifFilePicker,
    sendGifFromUrl,
    handleGifFile,
    openCamera,
    closeCamera,
    captureCamera,
    startVoiceCall,
    startVideoCall,
    acceptIncomingCall,
    declineIncomingCall,
    endCall,
    closeCallPanel,
    onSocketEvent,
  };
})();
