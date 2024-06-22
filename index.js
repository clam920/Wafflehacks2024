require('./utils.js');
require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt'); 
const MongoStore = require('connect-mongo');
const { MongoClient } = require('mongodb');
const app = express();
const port = process.env.PORT || 3000;

const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;
const node_session_secret = process.env.NODE_SESSION_SECRET;

const mongoUri = `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/?retryWrites=true&w=majority`;

const navLinks = [
    { name: 'Profile', link: '/home' },
    { name: 'Explore', link: '/explore' },
    { name: 'Message', link: '/message' }
];

let database;
MongoClient.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(client => {
        database = client.db(mongodb_database);
        console.log('Connected to Database');
    })
    .catch(error => console.error(error));

app.use(express.urlencoded({ extended: true }));

var mongoStore = MongoStore.create({
    mongoUrl: mongoUri,
    crypto: {
        secret: mongodb_session_secret
    }
});

app.use(session({
    secret: node_session_secret,
    store: mongoStore,
    saveUninitialized: false,
    resave: true
}));

app.set('view engine', 'ejs');

app.get("/", (req, res) => {
    res.render("index", { authenticated: req.session.authenticated, userName: req.session.userName, navLinks });
});

app.get("/home", (req, res) => {
    if (!req.session.authenticated) {
        res.redirect("/login");
        return;
    }
    res.render("profile", { authenticated: req.session.authenticated, userName: req.session.userName, navLinks });
});

app.get("/login", (req, res) => {
    res.render("login", { authenticated: req.session.authenticated, navLinks });
});

app.post("/loggingin", async (req, res) => {
    var email = req.body.email;
    var password = req.body.password;
    console.log(email);

    try {
        const userCollection = database.collection('users');
        const user = await userCollection.findOne({ email: email }, { projection: { password: 1, userName: 1 } });

        if (!user) {
            console.log("User not found");
            res.redirect('/');
            return;
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (passwordMatch) {
            console.log("Correct password");
            req.session.authenticated = true;
            req.session.userName = user.userName;
            res.redirect('/home');
        } else {
            console.log("Incorrect password");
            res.redirect('/');
        }
    } catch (error) {
        console.error(error);
        res.redirect('/');
    }
});

app.post("/signingup", async (req, res) => {
    var userName = req.body.userName;
    var email = req.body.email;
    var password = req.body.password;

    try {
        const userCollection = database.collection('users');
        const hashedPassword = await bcrypt.hash(password, 10);
        await userCollection.insertOne({ userName: userName, email: email, password: hashedPassword });
        req.session.authenticated = true;
        req.session.userName = userName;
        res.redirect("/home");
    } catch (error) {
        console.error(error);
        res.redirect("/signup");
    }
});

app.get("/signup", (req, res) => {
    res.render("signup", { authenticated: req.session.authenticated, navLinks });
});

app.get('/signout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/home');
        }
        res.redirect('/');
    });
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
