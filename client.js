const socket = io();
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const chatMessages = document.getElementById('chatMessages');
const userList = document.getElementById('userList');
const typingIndicator = document.getElementById('typingIndicator');
const chatHeader = document.getElementById('chatHeader');

// Debug connection
socket.on('connect', () => {
  console.log('Connected to server');
});
socket.on('connect_error', (err) => {
  console.error('Socket connection error:', err.message);
});

// Prompt for username and email
let username = prompt('Enter your username:');
let email = prompt('Enter your email:');
if (!username || !email) {
  username = 'Anonymous';
  email = 'anonymous@example.com';
}
socket.emit('join', { username, email });

let selectedUser = null;

// Handle server errors
socket.on('error', (message) => {
  alert(message);
  username = prompt('Enter a different username:');
  email = prompt('Enter a different email:');
  if (!username || !email) {
    username = 'Anonymous';
    email = 'anonymous@example.com';
  }
  socket.emit('join', { username, email });
});

// Send private message
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const message = messageInput.value.trim();
  if (message && selectedUser) {
    socket.emit('privateMessage', { sender: username, recipient: selectedUser, message });
    messageInput.value = '';
  }
});

// Typing indicator
messageInput.addEventListener('input', () => {
  if (selectedUser) {
    socket.emit('typing', { username, recipient: selectedUser });
    clearTimeout(typingIndicator.timeout);
    typingIndicator.timeout = setTimeout(() => {
      typingIndicator.textContent = '';
    }, 2000);
  }
});

// Receive chat history
socket.on('chatHistory', (messages) => {
  console.log('Received chatHistory:', messages);
  chatMessages.innerHTML = '';
  messages.forEach(msg => {
    displayMessage(msg);
    // Mark messages as seen if viewing as recipient
    if (msg.sender === selectedUser && msg.status !== 'seen') {
      socket.emit('messageSeen', {
        messageId: msg._id,
        sender: msg.sender,
        recipient: msg.recipient,
      });
    }
  });
});

// Receive private message
socket.on('privateMessage', (data) => {
  console.log('Received privateMessage:', data);
  if (
    (data.sender === username && data.recipient === selectedUser) ||
    (data.sender === selectedUser && data.recipient === username)
  ) {
    displayMessage(data);
    // Mark as seen if recipient is viewing the chat
    if (data.sender === selectedUser && data.status !== 'seen') {
      socket.emit('messageSeen', {
        messageId: data._id,
        sender: data.sender,
        recipient: data.recipient,
      });
    }
  }
});

// Receive typing indicator
socket.on('typing', (data) => {
  if (data.username === selectedUser) {
    typingIndicator.textContent = `${data.username} is typing...`;
    clearTimeout(typingIndicator.timeout);
    typingIndicator.timeout = setTimeout(() => {
      typingIndicator.textContent = '';
    }, 2000);
  }
});

// Receive message status update
socket.on('messageStatus', (data) => {
  console.log('Received messageStatus:', data);
  const messageElement = document.querySelector(`.message[data-message-id="${data._id}"]`);
  if (messageElement) {
    const statusElement = messageElement.querySelector('.message-status');
    if (statusElement) {
      statusElement.className = `message-status ${data.status}`;
    }
  }
});

// Receive user list from database
socket.on('userList', (users) => {
  console.log('Received userList���')
  userList.innerHTML = users
    .filter(user => user.username !== username)
    .map(user => `
      <div class="user-item" data-username="${user.username}">
        <span>${user.username}</span>
        <div class="user-email">${user.email}</div>
        <span class="user-status ${onlineUsers.includes(user.username) ? 'online' : 'offline'}">
          ${onlineUsers.includes(user.username) ? 'Online' : 'Offline'}
        </span>
      </div>
    `).join('');

  // Add click event to user items
  document.querySelectorAll('.user-item').forEach(item => {
    item.addEventListener('click', () => {
      selectedUser = item.dataset.username;
      document.querySelectorAll('.user-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      chatHeader.textContent = `Chat with ${selectedUser}`;
      socket.emit('loadChat', { sender: username, recipient: selectedUser });
    });
  });
});

// Track online users for status updates
let onlineUsers = [];
socket.on('onlineUsers', (users) => {
  console.log('Received onlineUsers:', users);
  onlineUsers = users;
  document.querySelectorAll('.user-item').forEach(item => {
    const status = item.querySelector('.user-status');
    const user = item.dataset.username;
    status.textContent = onlineUsers.includes(user) ? 'Online' : 'Offline';
    status.classList.toggle('online', onlineUsers.includes(user));
    status.classList.toggle('offline', !onlineUsers.includes(user));
  });
});

socket.on('userStatus', (data) => {
  console.log('Received userStatus:', data);
  document.querySelectorAll('.user-item').forEach(item => {
    if (item.dataset.username === data.username) {
      const status = item.querySelector('.user-status');
      status.textContent = data.status.charAt(0).toUpperCase() + data.status.slice(1);
      status.classList.toggle('online', data.status === 'online');
      status.classList.toggle('offline', data.status === 'offline');
    }
  });
});

// Display message
function displayMessage(data) {
  const div = document.createElement('div');
  div.className = `message ${data.sender === username ? 'sent' : 'received'}`;
  div.setAttribute('data-message-id', data._id);
  div.innerHTML = `
    <strong>${data.sender}</strong>
    <p>${data.message}</p>
    <small class="text-gray-500">${new Date(data.timestamp).toLocaleTimeString()}</small>
    ${data.sender === username ? `<span class="message-status ${data.status}"></span>` : ''}
  `;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}