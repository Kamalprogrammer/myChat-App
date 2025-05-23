const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  email: { type: String, unique: true, required: true },
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model('User', userSchema);

// Message Schema
const messageSchema = new mongoose.Schema({
  sender: String,
  recipient: String,
  message: String,
  status: { type: String, enum: ['sent', 'delivered', 'seen'], default: 'sent' },
  timestamp: { type: Date, default: Date.now },
});
const Message = mongoose.model('Message', messageSchema);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Track online users
const onlineUsers = new Set();

// Socket.IO Logic
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  let username;

  // Register or join user
  socket.on('join', async (userData) => {
    console.log('Join event received:', userData);
    username = userData.username;
    try {
      await User.findOneAndUpdate(
        { username },
        { username, email: userData.email, createdAt: new Date() },
        { upsert: true, new: true }
      );
      onlineUsers.add(username);
      socket.join(username);
      io.emit('userStatus', { username, status: 'online' });

      // Send all users from database
      const users = await User.find().select('username email');
      console.log('Sending userList:', users);
      io.emit('userList', users);

      // Send online users for status
      io.emit('onlineUsers', Array.from(onlineUsers));

      // Update status to delivered for messages where user is recipient
      await Message.updateMany(
        { recipient: username, status: 'sent' },
        { status: 'delivered' }
      );
      const updatedMessages = await Message.find({
        recipient: username,
        status: 'delivered',
      });
      updatedMessages.forEach((msg) => {
        io.to(msg.sender).to(msg.recipient).emit('messageStatus', {
          _id: msg._id,
          status: msg.status,
        });
      });
    } catch (err) {
      console.error('Error joining user:', err);
      socket.emit('error', 'Failed to join. Username or email may already exist.');
    }
  });

  // User disconnects
  socket.on('disconnect', () => {
    if (username) {
      onlineUsers.delete(username);
      io.emit('userStatus', { username, status: 'offline' });
      io.emit('onlineUsers', Array.from(onlineUsers));
    }
  });

  // Handle typing
  socket.on('typing', (data) => {
    const { recipient, username } = data;
    io.to(recipient).emit('typing', { username });
  });

  // Handle private message
  socket.on('privateMessage', async (data) => {
    const { sender, recipient, message } = data;
    const roomName = [sender, recipient].sort().join('-');
    socket.join(roomName);

    // Save message to MongoDB
    const status = onlineUsers.has(recipient) ? 'delivered' : 'sent';
    const newMessage = new Message({ sender, recipient, message, status });
    await newMessage.save();

    // Send message to both sender and recipient
    io.to(sender).to(recipient).emit('privateMessage', {
      _id: newMessage._id,
      sender,
      recipient,
      message,
      status: newMessage.status,
      timestamp: newMessage.timestamp,
    });

    // Send chat history for this conversation
    const messages = await Message.find({
      $or: [
        { sender, recipient },
        { sender: recipient, recipient: sender },
      ],
    }).sort({ timestamp: 1 }).limit(50);
    io.to(sender).to(recipient).emit('chatHistory', messages);
  });

  // Load chat history for a specific user pair
  socket.on('loadChat', async (data) => {
    const { sender, recipient } = data;
    const messages = await Message.find({
      $or: [
        { sender, recipient },
        { sender: recipient, recipient: sender },
      ],
    }).sort({ timestamp: 1 }).limit(50);

    // Mark messages as seen if recipient is viewing
    await Message.updateMany(
      { sender: recipient, recipient: sender, status: { $in: ['sent', 'delivered'] } },
      { status: 'seen' }
    );
    const updatedMessages = await Message.find({
      sender: recipient,
      recipient: sender,
      status: 'seen',
    });
    updatedMessages.forEach((msg) => {
      io.to(msg.sender).to(msg.recipient).emit('messageStatus', {
        _id: msg._id,
        status: msg.status,
      });
    });

    socket.emit('chatHistory', messages);
  });

  // Handle seen event
  socket.on('messageSeen', async (data) => {
    const { messageId, sender, recipient } = data;
    await Message.updateOne({ _id: messageId }, { status: 'seen' });
    io.to(sender).to(recipient).emit('messageStatus', {
      _id: messageId,
      status: 'seen',
    });
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});