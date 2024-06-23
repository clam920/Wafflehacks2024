require("./utils.js");
require('dotenv').config();

const express = require('express');
const fs = require("fs");
const app = express();
const MongoStore = require('connect-mongo');
const port = process.env.PORT || 3000;
app.set('view engine', 'ejs');

const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;


var mongoStore = MongoStore.create({
    mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/sessions`,
    crypto: {
        secret: mongodb_session_secret
    }
})

app.get("/messages", (req, res) => {
    // bugsnag.start();
    let messages = fs.readFileSync("./messages.html", "utf8");
    res.send(messages);
})

app.get("/home", (req, res) => {
    // TO DO: Retrieve matched users using algorithm
    const matchedUsers = [{
        name: "John",
        id: "123",
    }];

    res.render("home", { matchedUsers });
})

app.get("*", (req, res) => {
    res.status(404);
    res.send("Page not found - 404");
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

