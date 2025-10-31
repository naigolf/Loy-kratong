const { TikTokLiveConnection, WebcastEvent } = require('tiktok-live-connector');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios'); // ✅ 1. เพิ่ม axios สำหรับการเรียก API

// ⚠️ 2. แทนที่ด้วย URL ของ Web App ที่คุณเผยแพร่จาก Apps Script
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzD6oANxjEIOMDPv3IOQ4AIlJrx5MmZzDuI1kQvNfohw9bSR7QD1P6w6en5kdZjM2YWoA/exec'; 

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public')); 

let connection = null;

// ✅ 3. ฟังก์ชันใหม่: ส่งข้อมูลไปที่ Apps Script API
async function saveChatToSheet(data) {
    try {
        const response = await axios.post(APPS_SCRIPT_URL, data, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        // แสดงผลลัพธ์จาก Apps Script (เช่น success/error)
        console.log('Apps Script Response:', response.data); 
    } catch (error) {
        console.error('Error sending data to Apps Script:', error.message);
    }
}

/////////////////////////////////////////////////////////////

// ✅ ฟังก์ชันช่วย: ค้นหา URL รูปโปรไฟล์ที่ถูกต้อง
function getProfileImageUrl(userData) {
    // 1. ลองใช้ avatarThumb (ฟิลด์ที่นิยมใช้ที่สุด)
    if (userData.avatarThumb) {
        return userData.avatarThumb;
    }
    // 2. ลองใช้ profilePictureUrl (ฟิลด์ที่เคยมีการใช้งาน)
    if (userData.profilePictureUrl) {
        return userData.profilePictureUrl;
    }
    // 3. ลองใช้ avatarUrl (อีกหนึ่งทางเลือก)
    if (userData.avatarUrl) {
        return userData.avatarUrl;
    }
    // คืนค่าเป็นสตริงว่างเปล่า ถ้าไม่พบฟิลด์ใดเลย
    return ""; 
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

        // ✅ 4. CHAT Event ที่ถูกแก้ไข
        connection.on(WebcastEvent.CHAT, data => {
            const chatData = {
                nickname: data.user.nickname,
                comment: data.comment,
                //profilePictureUrl: data.user.profilePictureUrl
                profilePictureUrl: getProfileImageUrl(data.user)
            };

            // ตรวจสอบใน Console ของ Node.js ว่าได้ URL จริงหรือไม่
            console.log(`Chat from ${chatData.nickname}. Profile URL: ${chatData.profilePictureUrl}`);
            
            // ส่งข้อมูลไปยัง Frontend ผ่าน Socket.io (โค้ดเดิม)
            socket.emit('chat', chatData); 

            // ส่งข้อมูลไปยัง Apps Script (โค้ดที่เพิ่มใหม่)
            saveChatToSheet(chatData);
        });

        // ❌ ลบ Event LISTENERS สำหรับ GIFT, LIKE และอื่นๆ ออก
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
