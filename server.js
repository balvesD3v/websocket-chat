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

let chatMessages = {}; // Armazena mensagens por sala (roomId)
let timers = {}; // Armazenar os tempos por sala
let billing = {}; // Armazenar os valores debitados/creditados por sala

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

    socket.on('join room', ({ roomId, rate }) => {
        requestId = roomId;
        socket.join(requestId);
        userType = getUserType(socket.id);

        // Inicializa dados da sala, se ainda não existir
        if (!timers[requestId]) {
            timers[requestId] = { interval: null, isPaused: true }; // Adiciona a flag 'isPaused'
            billing[requestId] = { customer: 0, consultant: 0 }; // Inicializa os valores de cobrança
            timers[requestId].rate = rate || 0.5; // Usa 0.5 como valor padrão, se 'rate' não for enviado
        }

        // Envia as mensagens anteriores ao usuário que acabou de entrar
        if (chatMessages[requestId]) {
            socket.emit('load previous messages', chatMessages[requestId]); // Envia todas as mensagens armazenadas
        }

        const room = io.sockets.adapter.rooms.get(requestId);
        const numUsersInRoom = room ? room.size : 0;

        if (numUsersInRoom === 2) {
            io.to(requestId).emit('chat enabled', true);

            if (timers[requestId].isPaused) { // Retoma o cronômetro se estiver pausado
                timers[requestId].isPaused = false;
                timers[requestId].startTime = Date.now() - (timers[requestId].pausedTime || 0); // Ajusta o tempo para considerar a pausa

                if (!timers[requestId].interval) {
                    timers[requestId].interval = setInterval(() => {
                        if (!timers[requestId].isPaused) {
                            const elapsedSeconds = Math.floor((Date.now() - timers[requestId].startTime) / 1000);
                            const rate = timers[requestId].rate;

                            // Calcula diretamente o valor total com base no tempo transcorrido
                            const totalAmount = (elapsedSeconds * rate).toFixed(2);

                            // Atualiza os valores de cobrança sem acumular incrementalmente
                            billing[requestId].customer = parseFloat(totalAmount);
                            billing[requestId].consultant = parseFloat(totalAmount);

                            io.to(requestId).emit('update timer', elapsedSeconds);
                            io.to(requestId).emit('update billing', billing[requestId]);
                        }
                    }, 1000);

                }
            }
        } else {
            io.to(requestId).emit('chat enabled', false);
            timers[requestId].isPaused = true; // Pausa o cronômetro
            timers[requestId].pausedTime = Date.now() - timers[requestId].startTime; // Calcula o tempo decorrido até a pausa
        }

        // Envia o valor atual de cobrança para o cliente reconectado
        if (billing[requestId]) {
            io.to(socket.id).emit('update billing', billing[requestId]);
        }
    });

    socket.on('chat message', ({ requestId, message }) => {

        const room = io.sockets.adapter.rooms.get(requestId);
        if (room && room.size >= 1) {
            // Armazena a mensagem com o sender vindo do cliente
            if (!chatMessages[requestId]) {
                chatMessages[requestId] = [];
            }
            chatMessages[requestId].push(message); // Salva mensagem no servidor

            io.to(requestId).emit('chat message', message); // Envia a mensagem para todos na sala
        }
    });


    socket.on('end chat', () => {
        // Envia evento para todos na sala
        io.to(requestId).emit('chat ended', { redirect: true });

        // Envia mensagem para o outro participante
        socket.to(requestId).emit('chat message', {
            message: 'O outro participante encerrou o chat.',
            sender: 'system'
        });

        // Notifica todos os usuários da sala que o chat foi encerrado
        io.to(requestId).emit('chat ended', { redirect: true });

        // Limpa cronômetro e dados da sala
        if (timers[requestId]) {
            clearInterval(timers[requestId].interval);
            delete timers[requestId];
        }

        delete billing[requestId];
        delete chatMessages[requestId]; // Remove mensagens armazenadas
    });

    socket.on('end chat without credits', ({ requestId }) => {
        // Envia uma mensagem para os participantes na sala
        io.to(requestId).emit('chat message', {
            message: 'Chat encerrado sem alterações nos créditos.',
            sender: 'system'
        });

        // Emite um evento indicando que o chat foi encerrado
        io.to(requestId).emit('chat ended', { redirect: true });

        if (timers[requestId]) {
            clearInterval(timers[requestId].interval);
            delete timers[requestId];
        }

        delete billing[requestId]; // Limpa os valores de cobrança
        delete chatMessages[requestId]; // Remove mensagens armazenadas
    });

    socket.on('pause chat', ({ requestId, reason }) => {
        // Notifica todos na sala que o chat foi pausado
        io.to(requestId).emit('chat paused', { reason });

        // Pausar cronômetro da sessão
        if (timers[requestId]) {
            timers[requestId].isPaused = true; // Pausa o cronômetro
            timers[requestId].pausedTime = Date.now() - timers[requestId].startTime; // Salva o tempo decorrido
            clearInterval(timers[requestId].interval); // Para o cronômetro
            timers[requestId].interval = null; // Limpa o intervalo
        }
    });

    socket.on('resume chat', ({ requestId }) => {
        if (timers[requestId] && timers[requestId].isPaused) {
            timers[requestId].isPaused = false; // Retoma o cronômetro
            timers[requestId].startTime = Date.now() - timers[requestId].pausedTime; // Ajusta o tempo com base na pausa

            // Reinicia o intervalo
            timers[requestId].interval = setInterval(() => {
                if (!timers[requestId].isPaused) {
                    const elapsedSeconds = Math.floor((Date.now() - timers[requestId].startTime) / 1000);
                    const rate = timers[requestId].rate;

                    // Calcula o valor total acumulado
                    const totalAmount = (elapsedSeconds * rate).toFixed(2);

                    // Simula o saldo atual do cliente (substitua pela integração com seu sistema real)
                    const currentCustomerCredits = billing[requestId]?.customerCredits || 10000000;

                    // Verifica se o cliente tem saldo suficiente
                    if (parseFloat(totalAmount) > currentCustomerCredits) {
                        // Limita o valor debitado ao saldo disponível
                        billing[requestId].customer = currentCustomerCredits;
                        billing[requestId].consultant = currentCustomerCredits;

                        // Pausa o cronômetro e notifica os participantes
                        timers[requestId].isPaused = true;
                        clearInterval(timers[requestId].interval); // Para o cronômetro
                        timers[requestId].interval = null;

                        io.to(requestId).emit('chat paused', {
                            reason: "Créditos insuficientes. Por favor, recarregue para continuar.",
                        });
                    } else {
                        // Atualiza o valor debitado normalmente
                        billing[requestId].customer = parseFloat(totalAmount);
                        billing[requestId].consultant = parseFloat(totalAmount);

                        io.to(requestId).emit('update timer', elapsedSeconds); // Atualiza o tempo de sessão
                        io.to(requestId).emit('update billing', billing[requestId]); // Atualiza os valores de débito/crédito
                    }
                }
            }, 1000);

            // Notifica os participantes que o chat foi retomado
            io.to(requestId).emit('chat resumed', { message: "O chat foi retomado." });
        }
    });


    socket.on('disconnect', () => {
        const room = io.sockets.adapter.rooms.get(requestId);
        const numUsersInRoom = room ? room.size : 0;

        if (numUsersInRoom < 2) {
            io.to(requestId).emit('chat enabled', false);
            if (timers[requestId]) {
                timers[requestId].isPaused = true; // Pausa o cronômetro quando alguém sai
                timers[requestId].pausedTime = Date.now() - timers[requestId].startTime; // Armazena o tempo decorrido
            }
        }

        if (numUsersInRoom === 0) {
            if (timers[requestId]) {
                clearInterval(timers[requestId].interval);
                delete timers[requestId];
            }
            delete billing[requestId]; // Limpa os valores de cobrança ao sair todos os usuários
            delete chatMessages[requestId]; // Remove mensagens armazenadas
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
