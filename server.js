const { TikTokLiveConnection, WebcastEvent } = require('tiktok-live-connector');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');

// URL สำหรับ Google Apps Script (เหมือนเดิม)
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzD6oANxjEIOMDPv3IOQ4AIlJrx5MmZzDuI1kQvNfohw9bSR7QD1P6w6en5kdZjM2YWoA/exec';

// ⬇️⬇️⬇️ 1. ใส่ชื่อช่อง TIKTOK ID (UNIQUE ID) ของคุณที่นี่ ⬇️⬇️⬇️
// (ต้องขึ้นต้นด้วย @)
const TIKTOK_UNIQUE_ID = "@chachangthong"; 
// ⬆️⬆️⬆️ 1. ใส่ชื่อช่อง TIKTOK ID (UNIQUE ID) ของคุณที่นี่ ⬆️⬆️⬆️

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let connection = null;

// ฟังก์ชัน saveChatToSheet (เหมือนเดิม)
async function saveChatToSheet(data) {
    try {
        const response = await axios.post(APPS_SCRIPT_URL, data, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        // console.log('Apps Script Response:', response.data);
    } catch (error) {
        console.error('Error sending data to Apps Script:', error.message);
    }
}

// ฟังก์ชัน getProfileImageUrl (เหมือนเดิม)
function getProfileImageUrl(userData) {
    if (userData.profilePicture &&
        userData.profilePicture.url &&
        Array.isArray(userData.profilePicture.url) &&
        userData.profilePicture.url.length > 0) {
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
                return userData[field][0];
            }
            if (typeof userData[field] === 'string' && userData[field].trim() !== '') {
                return userData[field];
            }
        }
    }
    return "";
}


// ฟังก์ชัน connectAndListen (แก้ไขเล็กน้อย)
function connectAndListen(socket, uniqueId) {
    // 1. ยกเลิกการเชื่อมต่อเก่าหากมี
    if (connection) {
        console.log(`[${uniqueId}] Disconnecting existing connection...`);
        connection.disconnect();
        connection = null;
    }

    // 2. สร้างและเชื่อมต่อใหม่
    console.log(`\n======================================================`);
    console.log(`✨ [${uniqueId}] Attempting to connect to TikTok Live...`);
    console.log(`======================================================`);
    
    connection = new TikTokLiveConnection(uniqueId, {
        // ⬇️⬇️⬇️ 2. (คำแนะนำ) หากคุณใช้ Render.com แล้วยังเจอปัญหา Error ⬇️⬇️⬇️
        // ให้ลองหา Proxy มาใส่ตรงนี้ (เอา // ออก)
        // proxy: "http://USER:PASSWORD@IP_ADDRESS:PORT"
        // ⬆️⬆️⬆️ 2. (คำแนะนำ) ⬆️⬆️⬆️
    });

    connection.connect().then(state => {
        console.log(`✅ [${uniqueId}] Connected to roomId: ${state.roomId}`);
        socket.emit('connected', { roomId: state.roomId, uniqueId: uniqueId });
    }).catch(err => {
        console.error(`❌ [${uniqueId}] Connect error:`, err.toString());
        socket.emit('error', { msg: '❌ Failed to connect: ' + err.toString() + '. Retrying...' });
        // ลองเชื่อมต่อใหม่ทันทีหากเชื่อมต่อไม่สำเร็จ
        setTimeout(() => connectAndListen(socket, uniqueId), 5000); 
    });

    // 3. จัดการ Events (CHAT, MEMBER, Error, Disconnect)

    // CHAT Event
    connection.on(WebcastEvent.CHAT, data => {
        const profileUrl = getProfileImageUrl(data.user);
        
        const chatData = {
            nickname: data.user.nickname || data.user.uniqueId || 'Unknown',
            uniqueId: data.user.uniqueId || '',
            comment: data.comment || '',
            profilePictureUrl: profileUrl,
            timestamp: new Date().toISOString()
        };
        
        socket.emit('chat', chatData);
        saveChatToSheet(chatData);
    });

    // MEMBER Event
    connection.on(WebcastEvent.MEMBER, data => {
        const profileUrl = getProfileImageUrl(data.user);
        
        const memberData = {
            nickname: data.user.nickname || data.user.uniqueId || 'Unknown',
            uniqueId: data.user.uniqueId || '',
            profilePictureUrl: profileUrl,
            action: 'joined',
            timestamp: new Date().toISOString()
        };
        
        socket.emit('member', memberData);
    });

    // Error handling
    connection.on('error', (err) => {
        console.error(`🔴 [${uniqueId}] TikTok Live Error (Internal):`, err);
        socket.emit('error', { msg: '🔴 Live Error. Reconnecting in 5s...' });
        
        connection.disconnect();
        setTimeout(() => connectAndListen(socket, uniqueId), 5000);
    });

    // Disconnect handling
    connection.on('disconnect', () => {
        console.log(`⚠️ [${uniqueId}] Disconnected from TikTok Live. Reconnecting in 5s...`);
        socket.emit('error', { msg: '⚠️ Connection lost. Reconnecting in 5s...' });

        setTimeout(() => connectAndListen(socket, uniqueId), 5000); 
    });
}

// ⬇️⬇️⬇️ 3. แก้ไข io.on('connection') ⬇️⬇️⬇️
io.on('connection', (socket) => {
    console.log('✅ Frontend connected (Socket ID: ' + socket.id + ')');
    console.log(`🚀 Starting TikTok connection for: ${TIKTOK_UNIQUE_ID}`);

    // เรียกใช้ฟังก์ชัน connectAndListen ทันที
    // โดยใช้ TIKTOK_UNIQUE_ID ที่เรากำหนดไว้ด้านบน
    connectAndListen(socket, TIKTOK_UNIQUE_ID);

    // ลบ socket.on('start', ...) ออกไป เพราะไม่จำเป็นแล้ว
    /* socket.on('start', ({ uniqueId }) => {
        connectAndListen(socket, uniqueId);
    });
    */

    socket.on('disconnect', () => {
        console.log('🔌 Frontend disconnected (Socket ID: ' + socket.id + ')');
        // ⬇️⬇️⬇️ 4. หยุดการเชื่อมต่อเมื่อ frontend ตัดการเชื่อมต่อ ⬇️⬇️⬇️
        if (connection) {
            console.log('🛑 Stopping TikTok connection...');
            connection.disconnect();
            connection = null;
        }
    });
});
// ⬆️⬆️⬆️ 3. สิ้นสุดการแก้ไข io.on('connection') ⬆️⬆️⬆️

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`✅ Server listening on port ${PORT}`);
    console.log(`🎯 TikTok ID to monitor: ${TIKTOK_UNIQUE_ID}`);
    console.log(`📡 Waiting for frontend connection to start...`);
    console.log(`======================================================`);
});
