const { TikTokLiveConnection, WebcastEvent } = require('tiktok-live-connector');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');

// URL สำหรับ Google Apps Script ของคุณ
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzD6oANxjEIOMDPv3IOQ4AIlJrx5MmZzDuI1kQvNfohw9bSR7QD1P6w6en5kdZjM2YWoA/exec';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let connection = null;

async function saveChatToSheet(data) {
    try {
        const response = await axios.post(APPS_SCRIPT_URL, data, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        console.log('Apps Script Response:', response.data);
    } catch (error) {
        console.error('Error sending data to Apps Script:', error.message);
    }
}

/////////////////////////////////////////////////////////////

// ✅ ฟังก์ชันช่วย: ค้นหา URL รูปโปรไฟล์ที่ถูกต้อง (เหมือนเดิม)
function getProfileImageUrl(userData) {
    if (userData.profilePicture &&
        userData.profilePicture.url &&
        Array.isArray(userData.profilePicture.url) &&
        userData.profilePicture.url.length > 0) {
        // console.log('✅ Found profile image in profilePicture.url[0]');
        return userData.profilePicture.url[0];
    }
    
    const possibleFields = [
        'profilePictureUrl',
        'avatarThumb',
        'avatarUrl',
        'avatarLarger',
        'avatarMedium'
    ];
    
    for (const field of possibleFields) {
        if (userData[field]) {
            if (Array.isArray(userData[field]) && userData[field].length > 0) {
                // console.log(`✅ Found profile image at ${field}[0]`);
                return userData[field][0];
            }
            if (typeof userData[field] === 'string' && userData[field].trim() !== '') {
                // console.log(`✅ Found profile image at ${field}`);
                return userData[field];
            }
        }
    }
    
    // console.log('❌ No profile image URL found');
    return "";
}

/////////////////////////////////////////////////////////////
// ✅ NEW: ฟังก์ชันเชื่อมต่อและจัดการการเชื่อมต่อซ้ำอัตโนมัติ
/////////////////////////////////////////////////////////////

function connectAndListen(socket, uniqueId) {
    // 1. ยกเลิกการเชื่อมต่อเก่าหากมี
    if (connection) {
        connection.disconnect();
        connection = null;
    }

    // 2. สร้างและเชื่อมต่อใหม่
    connection = new TikTokLiveConnection(uniqueId);
    console.log(`\n======================================================`);
    console.log(`✨ Attempting to connect to TikTok Live: ${uniqueId}`);
    console.log(`======================================================`);

    connection.connect().then(state => {
        console.log('✅ Connected to roomId:', state.roomId);
        socket.emit('connected', { roomId: state.roomId });
    }).catch(err => {
        console.error('❌ Connect error:', err.toString());
        socket.emit('error', { msg: '❌ Failed to connect: ' + err.toString() + '. Retrying...' });
        // ลองเชื่อมต่อใหม่ทันทีหากเชื่อมต่อไม่สำเร็จ
        setTimeout(() => connectAndListen(socket, uniqueId), 5000); 
    });

    // 3. จัดการ Events (CHAT, MEMBER, Error, Disconnect)

    // CHAT Event (เหมือนเดิม)
    connection.on(WebcastEvent.CHAT, data => {
        const profileUrl = getProfileImageUrl(data.user);
        
        const chatData = {
            nickname: data.user.nickname || data.user.uniqueId || 'Unknown',
            uniqueId: data.user.uniqueId || '',
            comment: data.comment || '',
            profilePictureUrl: profileUrl,
            timestamp: new Date().toISOString()
        };

        // console.log(`\n📩 Chat from ${chatData.nickname}`);
        
        socket.emit('chat', chatData);
        saveChatToSheet(chatData);
    });

    // MEMBER Event (เหมือนเดิม)
    connection.on(WebcastEvent.MEMBER, data => {
        const profileUrl = getProfileImageUrl(data.user);
        
        const memberData = {
            nickname: data.user.nickname || data.user.uniqueId || 'Unknown',
            uniqueId: data.user.uniqueId || '',
            profilePictureUrl: profileUrl,
            action: 'joined',
            timestamp: new Date().toISOString()
        };

        // console.log(`\n👋 ${memberData.nickname} joined!`);
        
        socket.emit('member', memberData);
    });

    // 🔴 Error handling & Auto Reconnect
    connection.on('error', (err) => {
        console.error('🔴 TikTok Live Error (Internal):', err);
        socket.emit('error', { msg: '🔴 Live Error. Reconnecting in 5s...' });
        
        // ยกเลิกการเชื่อมต่อปัจจุบัน (ถ้ามี) และพยายามเชื่อมต่อใหม่
        connection.disconnect();
        setTimeout(() => connectAndListen(socket, uniqueId), 5000); // ลองใหม่ใน 5 วินาที
    });

    // ⚠️ Disconnect handling & Auto Reconnect
    connection.on('disconnect', () => {
        console.log('⚠️ Disconnected from TikTok Live. Reconnecting in 5s...');
        socket.emit('error', { msg: '⚠️ Connection lost. Reconnecting in 5s...' });

        // พยายามเชื่อมต่อใหม่ทันทีเมื่อหลุด
        setTimeout(() => connectAndListen(socket, uniqueId), 5000); 
    });
}

io.on('connection', (socket) => {
    console.log('Frontend connected');

    socket.on('start', ({ uniqueId }) => {
        // เรียกใช้ฟังก์ชันใหม่
        connectAndListen(socket, uniqueId);
    });

    socket.on('disconnect', () => {
        console.log('Frontend disconnected');
        if (connection) {
            connection.disconnect();
            connection = null;
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
