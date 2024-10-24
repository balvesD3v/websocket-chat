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
    if (userId.startsWith('consultant_')) {
        return 'consultant';
    } else {
        return 'customer'; // Caso contrário, é um cliente
    }
}

io.on('connection', (socket) => {
    let userType;
    let requestId; // Variável para armazenar o requestId

    socket.on('join room', (roomId) => {
        requestId = roomId; // Armazenar o requestId
        socket.join(requestId);
        userType = getUserType(socket.id);
        io.to(requestId).emit('join room', userType);

        const room = io.sockets.adapter.rooms.get(requestId);
        const numUsersInRoom = room ? room.size : 0;

        if (numUsersInRoom === 2) {
            io.to(requestId).emit('start timer');
            io.to(requestId).emit('chat enabled', true); // Permitir envio de mensagens
        } else {
            io.to(requestId).emit('chat enabled', false); // Não permitir envio de mensagens
        }
    });

    socket.on('chat message', ({ message }) => {
        // Verifique se o chat está habilitado
        const room = io.sockets.adapter.rooms.get(requestId);
        if (room && room.size === 2) {
            io.to(requestId).emit('chat message', message);
        }
    });

    socket.on('end chat', () => {
        // Envia uma mensagem personalizada para o usuário que encerrou o chat
        io.to(socket.id).emit('chat message', {
            message: 'Você encerrou o chat.',
            sender: 'system' // Define o remetente como "system"
        });

        // Envia uma mensagem para o outro usuário informando que o chat foi encerrado
        socket.to(requestId).emit('chat message', {
            message: 'O outro participante encerrou o chat.',
            sender: 'system' // Define o remetente como "system"
        });

        io.to(requestId).emit('chat ended'); // Emite o evento de encerramento para ambos
    });


    socket.on('disconnect', () => {
        const room = io.sockets.adapter.rooms.get(requestId);
        const numUsersInRoom = room ? room.size : 0;

        if (numUsersInRoom < 2) {
            io.to(requestId).emit('chat enabled', false); // Desabilitar envio de mensagens
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
