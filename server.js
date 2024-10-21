const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: 'https://astroamor.com.br', // Use apenas o domínio
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

// Middleware CORS
app.use(cors({
    origin: '*',  // Aceitar todas as origens temporariamente para teste
    methods: ['GET', 'POST'],
    credentials: true,
}));

io.on('connection', (socket) => {
    console.log('Um usuário se conectou: ', socket.id);

    socket.on('join room', (requestId) => {
        socket.join(requestId);
        console.log(`Usuário ${socket.id} entrou na sala: ${requestId}`);
    });

    socket.on('chat message', ({ requestId, message }) => {
        console.log(`Mensagem recebida na sala ${requestId}:`, message);

        // Emite a mensagem apenas para os usuários na sala específica
        io.to(requestId).emit('chat message', message);
        console.log(`Mensagem enviada para a sala ${requestId}:`, message);
    });

    socket.on('disconnect', () => {
        console.log('Um usuário se desconectou: ', socket.id);
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
