// Connect to Socket.io backend running on localhost:3000
const socket = io('http://localhost:3000');

// DOM Elements
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const chatMessages = document.getElementById('chatMessages');
const userList = document.getElementById('userList');
const typingIndicator = document.getElementById('typingIndicator');
const chatHeader = document.getElementById('chatHeader');

// Debug connection
socket.on('connect', () => {
  console.log('Connected to server:', socket.id);
});

socket.on('connect_error', (err) => {
  console.error('Socket error:', err.message);
});

// Ask user info
let username = prompt('Enter your username:');
let email = prompt('Enter your email:');

if (!username || !email) {
  username = "Anonymous";
  email = "anonymous@example.com";
}

// Join event
socket.emit('join', { username, email });

// Selected user for private chat
let selectedUser = null;

// Handle server errors
socket.on('error', (message) => {
  alert(message);
});

// Send message
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
  chatMessages.innerHTML = '';
  messages.forEach(msg => displayMessage(msg));
});

// Receive private message
socket.on('privateMessage', (data) => {
  if (
    (data.sender === username && data.recipient === selectedUser) ||
    (data.sender === selectedUser && data.recipient === username)
  ) {
    displayMessage(data);
  }
});

// Typing indicator receive
socket.on('typing', (data) => {
  if (data.username === selectedUser) {
    typingIndicator.textContent = `${data.username} is typing...`;

    clearTimeout(typingIndicator.timeout);
    typingIndicator.timeout = setTimeout(() => {
      typingIndicator.textContent = '';
    }, 2000);
  }
});

// Online user list
let onlineUsers = [];

socket.on('onlineUsers', (users) => {
  onlineUsers = users;
});

// Receive full user list
socket.on('userList', (users) => {
  userList.innerHTML = users
    .filter(user => user.username !== username)
    .map(user => `
      <div class="user-item" data-username="${user.username}">
        <span>${user.username}</span>
        <span class="status">${onlineUsers.includes(user.username) ? 'Online' : 'Offline'}</span>
      </div>
    `)
    .join('');

  // Click event to open chat
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

// Display message on screen
function displayMessage(data) {
  const div = document.createElement('div');
  div.className = `message ${data.sender === username ? 'sent' : 'received'}`;

  div.innerHTML = `
    <strong>${data.sender}</strong>
    <p>${data.message}</p>
    <small>${new Date(data.timestamp).toLocaleTimeString()}</small>
  `;

  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
