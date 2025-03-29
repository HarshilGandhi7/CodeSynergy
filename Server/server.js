const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const ACTIONS = require("./Actions");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Store data
const rooms = new Map();
const userNames = new Map();
const codeStorage = new Map();

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // User joining a room
  socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId).add(socket.id);
    userNames.set(socket.id, username);

    socket.join(roomId);

    // Send the current code to the new user
    const currentCode =
      codeStorage.get(roomId) || `console.log("Hello from JavaScript!");`;
    socket.emit(ACTIONS.CODE_CHANGE, { code: currentCode });

    const clients = [...rooms.get(roomId)].map((id) => ({
      socketId: id,
      username: userNames.get(id),
    }));

    io.to(roomId).emit(ACTIONS.JOINED, {
      clients,
      username,
      socketId: socket.id,
    });
  });

  // Handle code changes
  socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
    codeStorage.set(roomId, code);
    socket.to(roomId).emit(ACTIONS.CODE_CHANGE, { code });
  });

  // Handle user disconnection
  socket.on("disconnecting", () => {
    for (let roomId of socket.rooms) {
      if (rooms.has(roomId)) {
        rooms.get(roomId).delete(socket.id);
        const clients = [...rooms.get(roomId)].map((id) => ({
          socketId: id,
          username: userNames.get(id),
        }));

        // Notify others that a user left
        io.to(roomId).emit(ACTIONS.DISCONNECTED, {
          socketId: socket.id,
          username: userNames.get(socket.id),
          clients,
        });

        // Cleanup empty rooms
        if (rooms.get(roomId).size === 0) {
          rooms.delete(roomId);
        }
        userNames.delete(socket.id);
      }
    }
  });

  // Handle WebRTC Signaling for Video Calls
  socket.on(ACTIONS.OFFER, ({ offer, roomId }) => {
    console.log(`Received offer in room ${roomId}`);
    socket.to(roomId).emit(ACTIONS.OFFER, { offer });
  });

  socket.on(ACTIONS.ANSWER, ({ answer, roomId }) => {
    console.log(`Received answer in room ${roomId}`);
    socket.to(roomId).emit(ACTIONS.ANSWER, { answer });
  });

  socket.on(ACTIONS.ICE_CANDIDATE, ({ candidate, roomId }) => {
    console.log(`Received ICE Candidate in room ${roomId}`);
    socket.to(roomId).emit(ACTIONS.ICE_CANDIDATE, { candidate });
  });

  socket.on("disconnect", () => {
    console.log(` Socket disconnected: ${socket.id}`);
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(` Server running on port ${PORT}`));
