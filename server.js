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

// Função para determinar o tipo de usuário (consultor ou cliente)
function getUserType(userId) {
    // Exemplo simples: IDs de consultores começam com 'consultant_'
    if (userId.startsWith('consultant_')) {
        return 'consultant';
    } else {
        return 'customer'; // Caso contrário, é um cliente
    }
}

io.on('connection', (socket) => {

    socket.on('join room', (requestId) => {

        socket.join(requestId);

        // Emitir para todos na sala o tipo de usuário que entrou
        const userType = getUserType(socket.id);
        io.to(requestId).emit('join room', userType);

        // Verificar o número de usuários na sala
        const room = io.sockets.adapter.rooms.get(requestId);
        const numUsersInRoom = room ? room.size : 0;

        // Iniciar o cronômetro quando ambos os usuários estiverem na sala
        if (numUsersInRoom === 2) {
            io.to(requestId).emit('start timer'); // Emite o evento para iniciar o cronômetro
        }
    });

    socket.on('chat message', ({ requestId, message }) => {
        io.to(requestId).emit('chat message', message);
    });

    socket.on('disconnect', () => {
    });
});



const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
