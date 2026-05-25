const express = require("express");

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Server running");
});
app.post("/webhook/github", (req, res) => {

  const event = {
    type: "deploy",
    repo: req.body.repository.full_name,
    author: req.body.pusher.name,
    timestamp: new Date(),
    commit: req.body.head_commit.message
  };

  console.log(event);

  res.sendStatus(200);
});


app.listen(3000, () => {
  console.log("Server started on port 3000");
});