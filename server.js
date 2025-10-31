const { TikTokLiveConnection, WebcastEvent } = require('tiktok-live-connector');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');

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

// ✅ ฟังก์ชันช่วย: ค้นหา URL รูปโปรไฟล์ที่ถูกต้อง (ปรับปรุงแล้ว)
function getProfileImageUrl(userData) {
    // ลอง log ข้อมูลทั้งหมดเพื่อดูว่ามีฟิลด์อะไรบ้าง
    console.log('User data structure:', JSON.stringify(userData, null, 2));
    
    // ลำดับความสำคัญของฟิลด์ที่ต้องตรวจสอบ
    const possibleFields = [
        'profilePictureUrl',
        'avatarThumb',
        'avatarUrl',
        'avatarLarger',
        'avatarMedium',
        'avatar_thumb',
        'avatar_larger',
        'avatar_medium'
    ];
    
    // วนลูปหาฟิลด์ที่มีค่า
    for (const field of possibleFields) {
        if (userData[field] && userData[field].trim() !== '') {
            console.log(`✅ Found profile image at field: ${field}`);
            return userData[field];
        }
    }
    
    // ลองเช็คใน nested object (บางครั้งอาจอยู่ใน userData.picture หรือ userData.avatar)
    if (userData.picture && typeof userData.picture === 'object') {
        for (const field of possibleFields) {
            if (userData.picture[field]) {
                console.log(`✅ Found profile image at picture.${field}`);
                return userData.picture[field];
            }
        }
    }
    
    if (userData.avatar && typeof userData.avatar === 'object') {
        for (const field of possibleFields) {
            if (userData.avatar[field]) {
                console.log(`✅ Found profile image at avatar.${field}`);
                return userData.avatar[field];
            }
        }
    }
    
    console.log('❌ No profile image URL found');
    return "https://via.placeholder.com/150?text=No+Image"; // รูป placeholder
}

/////////////////////////////////////////////////////////////

io.on('connection', (socket) => {
    console.log('Frontend connected');

    socket.on('start', ({ uniqueId }) => {
        if (connection) {
            connection.disconnect();
            connection = null;
        }

        connection = new TikTokLiveConnection(uniqueId);

        connection.connect().then(state => {
            console.log('Connected to roomId', state.roomId);
            socket.emit('connected', { roomId: state.roomId });
        }).catch(err => {
            console.error('Connect error', err);
            socket.emit('error', { msg: err.toString() });
        });

        // ✅ CHAT Event
        connection.on(WebcastEvent.CHAT, data => {
            // Log ข้อมูลทั้งหมดเพื่อ debug
            console.log('=== RAW CHAT DATA ===');
            console.log('Full data:', JSON.stringify(data, null, 2));
            
            const profileUrl = getProfileImageUrl(data.user);
            
            const chatData = {
                nickname: data.user.nickname || data.user.uniqueId || 'Unknown',
                uniqueId: data.user.uniqueId || '',
                comment: data.comment || '',
                profilePictureUrl: profileUrl,
                timestamp: new Date().toISOString()
            };

            console.log(`\n📩 Chat from ${chatData.nickname}`);
            console.log(`🔗 Profile URL: ${chatData.profilePictureUrl}\n`);
            
            // ส่งข้อมูลไปยัง Frontend
            socket.emit('chat', chatData); 

            // ส่งข้อมูลไปยัง Apps Script
            saveChatToSheet(chatData);
        });

        // ✅ เพิ่ม MEMBER Event (เมื่อมีคนเข้าห้อง live)
        connection.on(WebcastEvent.MEMBER, data => {
            console.log('=== NEW MEMBER ===');
            console.log('Member data:', JSON.stringify(data, null, 2));
            
            const profileUrl = getProfileImageUrl(data.user);
            
            const memberData = {
                nickname: data.user.nickname || data.user.uniqueId || 'Unknown',
                uniqueId: data.user.uniqueId || '',
                profilePictureUrl: profileUrl,
                action: 'joined',
                timestamp: new Date().toISOString()
            };

            console.log(`\n👋 ${memberData.nickname} joined!`);
            console.log(`🔗 Profile URL: ${memberData.profilePictureUrl}\n`);
            
            socket.emit('member', memberData);
        });

        // ✅ Error handling
        connection.on('error', err => {
            console.error('TikTok Live Error:', err);
            socket.emit('error', { msg: err.toString() });
        });

        // ✅ Disconnect handling
        connection.on('disconnect', () => {
            console.log('Disconnected from TikTok Live');
            socket.emit('disconnected');
        });
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
