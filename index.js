require("./utils.js");
require('dotenv').config();
const path = require('path')

const express = require('express');
const session = require('express-session');
const app = express();
const MongoStore = require('connect-mongo');
const port = process.env.PORT || 3000;

const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;

const node_session_secret = process.env.NODE_SESSION_SECRET;

var { database } = include('databaseconnection');

const userCollection = database.db(mongodb_database).collection('users');

app.use(express.urlencoded({ extended: true }));

var mongoStore = MongoStore.create({
    mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/sessions`,
    crypto: {
        secret: mongodb_session_secret
    }
});

app.use(session({
    secret: node_session_secret,
    store: mongoStore,
    saveUninitialized: false,
    resave: true
}
));


app.set('view engine', 'ejs')

app.get("/", (req,res) => {
    res.render("index")
})

app.get("/login", (req,res) => {
    res.render("login")
})

app.post("/loggingin", (req,res) => {

})

app.post("/signingup", async (req,res) => {
    var email = req.body.email;
    var password = req.body.password;
    console.log(email)
    await userCollection.insertOne({email: email, password: password});
    req.session.authenticated = true;
    res.redirect("/home")
})

app.get("/signup", (req,res) => {
    res.render("signup")
})

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

