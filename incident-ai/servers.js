const express = require("express");

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Server running");
});

app.post("/webhook/github", (req, res) => {
  console.log(req.body);

  res.status(200).send("Webhook received");
});

app.listen(3000, () => {
  console.log("Server started on port 3000");
});