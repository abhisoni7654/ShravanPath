import express from 'express';

import crypto from "crypto";
import fs from "fs";
import session from "express-session";
import MongoStore from 'connect-mongo';
import twilio from 'twilio'; 
import cors from 'cors';
import fetch from 'node-fetch';


const app = express();
const port = 3000;





app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(cors());


app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use(session({
    secret: 'a-real-secret-key-goes-here',
    resave: false, 
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: 'mongodb://localhost:27017/sih_sessions'
    }),
    cookie: {
        secure: false,
        maxAge: 1000 * 60 * 60 * 24
    }
}));


app.get("/",(req,res)=>{
    res.render("form.ejs");
});


app.get("/homepage", (req, res) => {
    if (req.session.currentUser) {
        try {
            const currentUserBlockchainId = req.session.currentUser.blockchain_id;

            const usersData = fs.readFileSync("current_users.json", "utf-8");
            const users = JSON.parse(usersData);
            const fullUserObject = users.find(u => u.blockchain_id === currentUserBlockchainId);
            
            if (!fullUserObject) {
                req.session.destroy();
                return res.redirect("/login");
            }

            res.render("homepage", { user: fullUserObject });

        } catch (error) {
            console.error("Error fetching user data for homepage:", error);
            res.redirect("/login");
        }
    } else {
        res.redirect("/login");
    }
});

app.get("/about",(req,res)=>{
    res.render("about.ejs");
});

app.get("/contact",(req,res)=>{
    res.render("contact.ejs");
});

app.get("/admin/login",(req,res)=>{
    res.render("admin-login.ejs");
});

app.get("/login", (req, res) => {
    const { error } = req.query;
    res.render("user-login", { error });
});

app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;
  const validUsername = "police";
  const validPassword = "password123";

  if (username === validUsername && password === validPassword) {
    req.session.isLoggedIn = true;
    res.redirect("/dashboard");
  } else {
    res.redirect("/admin/login?error=true");
  }
});
app.get("/dashboard", (req, res) => {
  if (!req.session.isLoggedIn) {
    return res.redirect("/admin/login");
  }

  let currentUsers = [];
  try {
    const data = fs.readFileSync("current_users.json", "utf-8");
    currentUsers = JSON.parse(data);
  } catch (error) {
    console.error("Error reading or parsing current_users.json:", error);
  }

  res.render("dashboard", { users: currentUsers });
});
app.get("/admin/anomalies", (req, res) => {
  if (!req.session.isLoggedIn) {
    return res.redirect("/admin/login");
  }

  let currentUsers = [];
  try {
    const data = fs.readFileSync("current_users.json", "utf-8");
    currentUsers = JSON.parse(data);
  } catch (error) {
    console.error("Error reading or parsing current_users.json:", error);
  }

  res.render("anamolies", { users: currentUsers });
});
app.post("/login", async (req, res) => {
    const { aadhaarNumber, password } = req.body;

    try {
        if (!fs.existsSync("current_users.json")) {
            return res.redirect("/login?error=not_found");
        }

        const usersData = fs.readFileSync("current_users.json", "utf-8");
        const users = JSON.parse(usersData);
        const user = users.find(u => u.aadhaarNumber === aadhaarNumber);

        if (!user) {
            return res.redirect("/login?error=not_found");
        }

        if (user.password !== password) {
            return res.redirect("/login?error=wrong_password");
        }

        req.session.currentUser = {
            blockchain_id: user.blockchain_id,
            fullName: user.fullName
        };
        req.session.save((err) => {
            if (err) {
                console.error("Session save error during login:", err);
                return res.redirect("/login?error=server_error");
            }
            res.redirect("/homepage");
        });

    } catch (error) {
        console.error("Login error:", error);
        res.redirect("/login?error=server_error");
    }
});

app.post("/api/nearby-places", async (req, res) => {
    const { lat, lon } = req.body;
    const radius = 30000;
    
    const overpassQuery = `
        [out:json];
        (
            node["tourism"="hotel"](around:${radius},${lat},${lon});
            node["tourism"="attraction"](around:${radius},${lat},${lon});
            node["tourism"="museum"](around:${radius},${lat},${lon});
            way["tourism"="hotel"](around:${radius},${lat},${lon});
            way["tourism"="attraction"](around:${radius},${lat},${lon});
        );
        out center;`;
    
    try {
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: overpassQuery,
            headers: { 'User-Agent': 'SIH-Demo/1.0' }
        });
        const data = await response.json();

        console.log("--- DATA RECEIVED FROM OVERPASS API ---");
        console.log(data);
        
        res.json(data);
    } catch (error) {
        console.error("Overpass API error:", error);
        res.status(500).json({ error: "Failed to fetch map data." });
    }
});

app.post("/contact", (req, res) => {
  const { name, email, phone, category, subject, message } = req.body;
  console.log("Form Data:", name, email, phone, category, subject, message);

  res.json({ success: true, name, email });
});

app.get("/ledger", (req, res) => {
  if (!req.session.isLoggedIn) {
    return res.redirect("/admin/login");
  }

  let ledgerEntries = [];
  try {
    const data = fs.readFileSync("ledger.json", "utf-8");
    ledgerEntries = JSON.parse(data);
  } catch (error) {
    console.error("Error reading or parsing ledger.json:", error);
  }

  res.render("ledger", { entries: ledgerEntries });
});
app.get("/profile", async (req, res) => {
    if (!req.session.currentUser || !req.session.currentUser.blockchain_id) {
        return res.redirect('/');
    }
    
    const userBlockchainId = req.session.currentUser.blockchain_id;
    
    try {
        const currentUsersData = fs.readFileSync("current_users.json", "utf-8");
        const users = JSON.parse(currentUsersData);
        const currentUserDetails = users.find(u => u.blockchain_id === userBlockchainId);

        if (!currentUserDetails) {
            return res.send("User not found.");
        }

        let userProfile = { ...currentUserDetails, emergencyContacts: [] };
        
        if (fs.existsSync("profiles.json")) {
            const profilesData = fs.readFileSync("profiles.json", "utf-8");
            const profiles = JSON.parse(profilesData);

            const existingProfile = profiles.find(p => p.aadhaarNumber === currentUserDetails.aadhaarNumber);
            
            if (existingProfile) {
                userProfile.emergencyContacts = existingProfile.emergencyContacts;
            }
        }
        res.render("profile", { user: userProfile });

    } catch (error) {
        console.error("Error fetching profile:", error);
        res.status(500).send("Server error.");
    }
});

app.get("/admin/emergencies", (req, res) => {
    if (!req.session.isLoggedIn) {
        return res.redirect("/admin/login");
    }

    let emergencies = [];
    if (fs.existsSync("emergencies.json")) {
        const emergenciesData = fs.readFileSync("emergencies.json", "utf-8");
        emergencies = JSON.parse(emergenciesData);
    }

    res.render("emergencies", { emergencies: emergencies });
});

app.post("/profile/update", async (req, res) => {
    console.log("--- RECEIVED PROFILE UPDATE REQUEST ---");
    console.log("Form Body:", req.body);
    if (!req.session.currentUser || !req.session.currentUser.blockchain_id) {
        return res.redirect('/');
    }
    const userBlockchainId = req.session.currentUser.blockchain_id;

    const { contacts } = req.body;
    const validContacts = contacts.filter(c => c.name && c.mobile);

    try {
        const usersData = fs.readFileSync("current_users.json", "utf-8");
        const allUsers = JSON.parse(usersData);
        const currentUser = allUsers.find(u => u.blockchain_id === userBlockchainId);

        if (!currentUser) {
            return res.status(404).send("Current user data not found.");
        }

        const newProfileEntry = {
            aadhaarNumber: currentUser.aadhaarNumber,
            fullName: currentUser.fullName,
            currentTravel: currentUser.currentTravel,
            blockchain_id:userBlockchainId,
            emergencyContacts: validContacts
        };

        let profiles = [];
        if (fs.existsSync("profiles.json")) {
            const profilesData = fs.readFileSync("profiles.json", "utf-8");
            profiles = JSON.parse(profilesData);
        }

        const userProfileIndex = profiles.findIndex(p => p.aadhaarNumber === currentUser.aadhaarNumber);

        if (userProfileIndex > -1) {
            profiles[userProfileIndex] = newProfileEntry;
        } else {
            profiles.push(newProfileEntry);
        }

        fs.writeFileSync("profiles.json", JSON.stringify(profiles, null, 2));

        res.redirect("/profile");

    } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).send("Server error while updating profile.");
    }
});app.post("/api/panic-alert", async (req, res) => {
    const { blockchain_id, latitude, longitude } = req.body;

    if (!blockchain_id || !latitude || !longitude) {
        return res.status(400).json({ success: false, message: "Missing required data." });
    }

    try {
        const usersData = fs.readFileSync("current_users.json", "utf-8");
        const allUsers = JSON.parse(usersData);
        const currentUser = allUsers.find(u => u.blockchain_id === blockchain_id);

        if (!currentUser) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        const emergencyEntry = {
            timestamp: new Date().toISOString(),
            fullName: currentUser.fullName,
            aadhaarNumber: currentUser.aadhaarNumber,
            mobile: currentUser.mobile,
            location: { latitude, longitude },
            isResolved: false,
            timeOfResolution: null
        };

        let emergencies = [];
        if (fs.existsSync("emergencies.json")) {
            const data = fs.readFileSync("emergencies.json", "utf-8");
            if (data) {
                emergencies = JSON.parse(data);
            }
        }
        
        emergencies.push(emergencyEntry);
        fs.writeFileSync("emergencies.json", JSON.stringify(emergencies, null, 2));

        res.json({ success: true, message: "Emergency alert successfully logged." });

    } catch (error) {
        console.error("Error logging panic alert:", error);
        res.status(500).json({ success: false, message: "Server error." });
    }
});
app.post("/api/set-user-session", (req, res) => {
    const { blockchain_id } = req.body;
    console.log("--- 1. SETTING SESSION ---");
    console.log("Received blockchain_id:", blockchain_id);
    
    if (blockchain_id) {
        req.session.currentUser = {
            blockchain_id: blockchain_id
        };
        console.log("Session object to be saved:", req.session);

        req.session.save((err) => {
            if (err) {
                console.error("Session save error:", err);
                return res.status(500).json({ success: false, message: "Failed to save session." });
            }
            console.log("Session saved successfully.");
            res.json({ success: true, message: "Session saved." });
        });

    } else {
        res.status(400).json({ success: false, message: "No blockchain_id provided." });
    }
});



app.post("/api/lookup", (req, res) => {
    const { aadhaarNumber } = req.body;

    if (!aadhaarNumber) {
        return res.status(400).json({ ok: false, error: "aadhaar_required" });
    }

    try {
        if (fs.existsSync("current_users.json")) {
            const currentUsersData = fs.readFileSync("current_users.json", "utf-8");
            const currentUsers = JSON.parse(currentUsersData);

            const existingUser = currentUsers.find(
                (u) => u.aadhaarNumber.toLowerCase() === aadhaarNumber.toLowerCase()
            );

            if (existingUser) {
                return res.json({
                    ok: false,
                    message: "user already exists, pls login",
                });
            }
        }
    } catch (error) {
        console.error("Error reading or parsing current_users.json:", error);
        return res.status(500).json({ ok: false, error: "internal_server_error" });
    }

    try {
        const data = JSON.parse(fs.readFileSync("test_users.json", "utf-8"));

        const user = data.find(
            (u) => u.aadhaarNumber.toLowerCase() === aadhaarNumber.toLowerCase()
        );

        if (!user) {
            return res.json({ ok: false, error: "aadhaar_not_found" });
        }

        res.json({
            ok: true,
            message: "Aadhaar exists. Please provide full name and DOB for verification.",
        });
    } catch (error) {
        console.error("Error reading or parsing test_users.json:", error);
        return res.status(500).json({ ok: false, error: "internal_server_error" });
    }
});

app.post("/api/complete-travel", (req, res) => {
    const { aadhaarNumber, secretWord } = req.body;

    if (!aadhaarNumber || !secretWord) {
        return res.status(400).json({ success: false, message: "Missing required information." });
    }

    try {
        const usersData = fs.readFileSync("current_users.json", "utf-8");
        let users = JSON.parse(usersData);
        
        const userIndex = users.findIndex(u => u.aadhaarNumber === aadhaarNumber);

        if (userIndex === -1) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        if (users[userIndex].secretWord !== secretWord) {
            return res.status(403).json({ success: false, message: "Incorrect secret word. Verification failed." });
        }

        users.splice(userIndex, 1);

        fs.writeFileSync("current_users.json", JSON.stringify(users, null, 2));
        res.json({ success: true, message: "User record deleted successfully." });

    } catch (error) {
        console.error("Error completing travel:", error);
        res.status(500).json({ success: false, message: "Server error." });
    }
});

app.post("/api/verify", (req, res) => {
    const { aadhaarNumber, fullName, dob, password, secretWord, mobile, currentTravel } = req.body;

    if (!aadhaarNumber || !fullName || !dob || !password || !secretWord || !mobile || !currentTravel) {
        return res.status(400).json({ ok: false, error: "missing_fields" });
    }

    const aadhaarData = JSON.parse(fs.readFileSync("test_users.json", "utf-8"));
    const user = aadhaarData.find(
        (u) => u.aadhaarNumber.toLowerCase() === aadhaarNumber.toLowerCase()
    );

    if (!user) {
        return res.json({ ok: false, error: "aadhaar_not_found" });
    }

    if (
        user.fullName.toLowerCase() !== fullName.toLowerCase() ||
        user.dob !== dob
    ) {
        return res.json({ ok: false, error: "verification_failed" });
    }

    const blockchain_id = crypto.randomUUID();
    const hash = crypto
        .createHash("sha256")
        .update(blockchain_id + Date.now())
        .digest("hex");

    let currentUsers = [];
    if (fs.existsSync("current_users.json")) {
        currentUsers = JSON.parse(fs.readFileSync("current_users.json", "utf-8"));
    }
    
    const registrationTime = new Date().toISOString();

    const currentUser = {
        ...user,
        password: password,
        secretWord: secretWord,
        mobile,
        currentTravel,
        verified: true,
        blockchain_id: hash,
        verifiedAt: registrationTime,
        isActive: true,
        lastActive: registrationTime,
    };

    currentUsers.push(currentUser);
    fs.writeFileSync("current_users.json", JSON.stringify(currentUsers, null, 2));

    const ledgerEntry = {
        timestamp: registrationTime,
        aadhaarNumber,
        blockchain_id: hash,
        action: "verified",
    };

    let ledger = [];
    if (fs.existsSync("ledger.json")) {
        ledger = JSON.parse(fs.readFileSync("ledger.json", "utf-8"));
    }
    ledger.push(ledgerEntry);
    fs.writeFileSync("ledger.json", JSON.stringify(ledger, null, 2));

    res.json({ success: true, blockchain_id: hash, message: "Verification successful" });
});

app.post("/api/update-location", (req, res) => {
  const { blockchain_id, latitude, longitude } = req.body;

  if (!blockchain_id || !latitude || !longitude) {
    return res.status(400).json({ success: false, message: "Missing data." });
  }

  try {
    const usersData = fs.readFileSync("current_users.json", "utf-8");
    let users = JSON.parse(usersData);

    const userIndex = users.findIndex(user => user.blockchain_id === blockchain_id);

    if (userIndex === -1) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    users[userIndex].location = {
      latitude: latitude,
      longitude: longitude,
      lastUpdated: new Date().toISOString()
    };
    
    fs.writeFileSync("current_users.json", JSON.stringify(users, null, 2));

    res.json({ success: true, message: "Location updated successfully." });

  } catch (error) {
    console.error("Error updating user location:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }
});
setInterval(() => {
    if (!fs.existsSync("current_users.json")) return;

    try {
        const usersData = fs.readFileSync("current_users.json", "utf-8");
        let users = JSON.parse(usersData);

        if (users.length === 0) return;

        users.forEach(u => {
            if (u.status && u.status.includes("Anomaly")) {
                u.status = "Normal";
            }
        });
        const randomIndex = Math.floor(Math.random() * users.length);
        const anomalyTypes = ["Prolonged Inactivity", "Route Deviation", "Unusual Speed"];
        const randomAnomaly = anomalyTypes[Math.floor(Math.random() * anomalyTypes.length)];
        
        users[randomIndex].status = `Anomaly Detected (${randomAnomaly})`;
        
        fs.writeFileSync("current_users.json", JSON.stringify(users, null, 2));
        console.log(`Mock AI: Flagged ${users[randomIndex].fullName} with an anomaly.`);

    } catch (error) {
        console.error("Mock AI Simulator Error:", error);
    }
}, 15000); 
app.post("/api/resolve-emergency", (req, res) => {
    const { timestamp, aadhaarNumber, secretWord } = req.body;

    if (!timestamp || !aadhaarNumber || !secretWord) {
        return res.status(400).json({ success: false, message: "Missing required information." });
    }

    try {
        // 1. Find user and verify secret word in current_users.json
        const usersData = fs.readFileSync("current_users.json", "utf-8");
        let users = JSON.parse(usersData);
        const userIndex = users.findIndex(u => u.aadhaarNumber === aadhaarNumber);

        if (userIndex === -1) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        if (users[userIndex].secretWord !== secretWord) {
            return res.status(403).json({ success: false, message: "Incorrect secret word." });
        }

        const emergenciesData = fs.readFileSync("emergencies.json", "utf-8");
        let emergencies = JSON.parse(emergenciesData);
        const emergencyIndex = emergencies.findIndex(e => e.timestamp === timestamp);

        if (emergencyIndex === -1) {
            return res.status(404).json({ success: false, message: "Emergency not found." });
        }

        const resolutionTime = new Date().toISOString();
        emergencies[emergencyIndex].isResolved = true;
        emergencies[emergencyIndex].timeOfResolution = resolutionTime;

        users[userIndex].secretWord = null;
        users[userIndex].secretWordUsedAt = resolutionTime;

        fs.writeFileSync("emergencies.json", JSON.stringify(emergencies, null, 2));
        fs.writeFileSync("current_users.json", JSON.stringify(users, null, 2));
        
        res.json({ success: true, message: "Emergency resolved." });

    } catch (error) {
        console.error("Error resolving emergency:", error);
        res.status(500).json({ success: false, message: "Server error." });
    }
});
app.post("/api/set-new-secret-word", (req, res) => {
    if (!req.session.currentUser) {
        return res.redirect("/login");
    }

    const { newSecretWord } = req.body;
    const currentUserBlockchainId = req.session.currentUser.blockchain_id;

    if (!newSecretWord) {
        return res.redirect("/homepage?error=secret_word_required");
    }

    try {
        const usersData = fs.readFileSync("current_users.json", "utf-8");
        let users = JSON.parse(usersData);
        const userIndex = users.findIndex(u => u.blockchain_id === currentUserBlockchainId);

        if (userIndex === -1) {
            return res.redirect("/login");
        }

        users[userIndex].secretWord = newSecretWord;
        users[userIndex].secretWordUsedAt = null;

        fs.writeFileSync("current_users.json", JSON.stringify(users, null, 2));
        res.redirect("/homepage");

    } catch (error) {
        console.error("Error setting new secret word:", error);
        res.redirect("/homepage?error=server_error");
    }
});
app.post('/api/translate', async (req, res) => {
  const { text, source, target } = req.body;
  if (!text || !source || !target) {
    return res.status(400).json({ success: false, message: 'Missing params' });
  }
  try {
    const resp = await fetch('https://libretranslate.com/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        source: source,
        target: target,
        format: 'text'
      })
    });
    const json = await resp.json();
    if (json.translatedText) {
      res.json({ success: true, translatedText: json.translatedText });
    } else {
      res.status(500).json({ success: false, message: 'Translation failed' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.toString() });
  }
});
app.listen(port,()=>{
    console.log(`Server listening on port ${port}`);
})