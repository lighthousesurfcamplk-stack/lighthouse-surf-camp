/* =========================================================
   Light House Surf Camp — PayHere payment backend
   ---------------------------------------------------------
   Generates the secure PayHere hash (the merchant secret must
   NEVER be exposed in the browser) and receives payment
   confirmations from PayHere.

   Run locally:   node payhere-server.js
   Deploy on:     Render, Railway, Fly.io, a VPS, or any Node host.
   ========================================================= */
const express = require("express");
const crypto  = require("crypto");
const cors    = require("cors");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const MERCHANT_ID     = process.env.PAYHERE_MERCHANT_ID     || "YOUR_MERCHANT_ID";
const MERCHANT_SECRET = process.env.PAYHERE_MERCHANT_SECRET || "YOUR_MERCHANT_SECRET";

const md5  = s => crypto.createHash("md5").update(s).digest("hex");
const upper = s => String(s).toUpperCase();

/* 1) Front-end calls this BEFORE redirecting to PayHere checkout.
      hash = UPPER( md5( merchant_id + order_id + amount + currency + UPPER(md5(secret)) ) )  */
app.post("/api/payhere-hash", (req, res) => {
  const { order_id, amount, currency } = req.body;
  const amountFormatted = Number(amount).toFixed(2);
  const hash = upper(md5(
    MERCHANT_ID + order_id + amountFormatted + currency + upper(md5(MERCHANT_SECRET))
  ));
  res.json({ hash, merchant_id: MERCHANT_ID });
});

/* 2) PayHere calls this server-to-server after every payment.
      Verify the signature, then mark the booking as paid / email the camp. */
app.post("/api/payhere-notify", (req, res) => {
  const { merchant_id, order_id, payhere_amount, payhere_currency,
          status_code, md5sig } = req.body;

  const local = upper(md5(
    merchant_id + order_id + payhere_amount + payhere_currency +
    status_code + upper(md5(MERCHANT_SECRET))
  ));

  if (local === md5sig && status_code === "2") {
    // ✅ Payment success & verified.
    // TODO: save the booking, email lighthousesurfcamp.lk@gmail.com, send WhatsApp confirmation.
    console.log("PAID ✓", order_id, payhere_amount, payhere_currency);
  } else {
    console.warn("Unverified / failed notify for", order_id, "status", status_code);
  }
  res.sendStatus(200);
});

app.get("/", (_, res) => res.send("Light House Surf Camp payment server is running 🌊"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Payment server on :" + PORT));
