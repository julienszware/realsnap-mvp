const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;

// --- Storage (MVP: fichiers en local dans /server/uploads) ---
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const id = uuidv4();
    const ext = path.extname(file.originalname) || ".bin";
    cb(null, `${id}${ext}`);
  },
});
const upload = multer({ storage });

app.use(express.json());
app.use("/uploads", express.static(uploadDir));
app.use("/public", express.static(path.join(__dirname, "public")));

// Page d’accueil simple
app.get("/", (req, res) => {
  res.send(`
    <h2>RealSnap MVP</h2>
    <p>Upload une image → lien de vérification + QR</p>
    <form action="/api/upload" method="post" enctype="multipart/form-data">
      <input type="file" name="file" accept="image/*" required />
      <button type="submit">Upload</button>
    </form>
  `);
});

// Upload
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu" });

    const filename = req.file.filename;
    const id = filename.split(".")[0]; // l’UUID
    const verifyUrl = `${req.protocol}://${req.get("host")}/v/${id}`;

    // Génère QR (data URL) + une image PNG dans /public
    const qrDataUrl = await QRCode.toDataURL(verifyUrl);
    const qrPngPath = path.join(__dirname, "public", `${id}.png`);
    await QRCode.toFile(qrPngPath, verifyUrl, { width: 320 });

    return res.send(`
      <h2>✅ Upload OK</h2>
      <p><b>Lien de vérification :</b> <a href="${verifyUrl}" target="_blank">${verifyUrl}</a></p>
      <p><b>QR Code :</b></p>
      <img src="${qrDataUrl}" />
      <p>PNG direct : <a href="/public/${id}.png" target="_blank">/public/${id}.png</a></p>
      <p>Fichier original : <a href="/uploads/${filename}" target="_blank">/uploads/${filename}</a></p>
      <p><a href="/">⬅️ Revenir</a></p>
    `);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Page de vérification (scanner QR -> arrive ici)
app.get("/v/:id", (req, res) => {
  const { id } = req.params;

  // Cherche un fichier dont le nom commence par id.
  const files = fs.readdirSync(uploadDir);
  const match = files.find((f) => f.startsWith(id));

  if (!match) {
    return res.status(404).send(`<h2>❌ Introuvable</h2><p>Aucun original pour cet ID.</p>`);
  }

  res.send(`
    <h2>✅ Verified by RealSnap (MVP)</h2>
    <p><b>ID:</b> ${id}</p>
    <p><b>Original stocké:</b></p>
    <img src="/uploads/${match}" style="max-width: 600px; width: 100%; border: 1px solid #ddd;" />
    <p><a href="/uploads/${match}" target="_blank">Ouvrir l’original</a></p>
  `);
});

app.listen(PORT, () => {
    console.log("test");
  console.log(`RealSnap MVP running on http://localhost:${PORT}`);
});
