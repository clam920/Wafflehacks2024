require('dotenv').config();
const path = require('path');
const express = require('express');
const fs = require("fs");
const app = express();
const session = require('express-session');
const bcrypt = require('bcrypt');
const MongoStore = require('connect-mongo');
const { MongoClient } = require('mongodb');
const passport = require('passport');
const SpotifyStrategy = require('passport-spotify').Strategy;
const axios = require('axios');
const port = process.env.PORT || 3000;
app.set('view engine', 'ejs');

const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;
const node_session_secret = process.env.NODE_SESSION_SECRET;

const spotify_client_id = process.env.SPOTIFY_CLIENT_ID;
const spotify_client_secret = process.env.SPOTIFY_CLIENT_SECRET;


if (!spotify_client_id || !spotify_client_secret) {
    console.error("Spotify client ID and secret must be provided!");
    process.exit(1);
}

const mongoUri = `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/?retryWrites=true&w=majority`;

const navLinks = [
    { name: 'Profile', link: '/profile' },
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

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

passport.use(new SpotifyStrategy({
    clientID: spotify_client_id,
    clientSecret: spotify_client_secret,
    callbackURL: "http://localhost:3001/callback"
},
async (accessToken, refreshToken, expires_in, profile, done) => {
    try {
        //ur trolling why is this not a global
        const userCollection = database.collection('users');
        await userCollection.updateOne(
            { spotifyId: profile.id },
            { $set: { spotifyId: profile.id, displayName: profile.displayName, spotifyAccessToken: accessToken, spotifyRefreshToken: refreshToken } },
            { upsert: true }
        );
        return done(null, { id: profile.id, accessToken, refreshToken });
    } catch (error) {
        return done(error, null);
    }
}));

app.set('view engine', 'ejs');

app.get("/", (req, res) => {
    res.render("index", { authenticated: req.session.authenticated, userName: req.session.userName, navLinks, currentURL: req.originalUrl });
});

app.get("/home", async (req, res) => {
    if (!req.session.authenticated) {
        res.redirect("/login");
        return;
    }

    const userCollection = database.collection('users');
    const user = await userCollection.findOne({ userName: req.session.userName });

    let spotifyProfile = null;
    if (user && user.spotifyAccessToken) {
        try {
            const response = await axios.get('https://api.spotify.com/v1/me', {
                headers: {
                    'Authorization': `Bearer ${user.spotifyAccessToken}`
                }
            });
            spotifyProfile = response.data;
        } catch (error) {
            console.error('Error fetching Spotify profile:', error);
        }
    }

    res.render('profile', {
        authenticated: req.session.authenticated,
        userName: req.session.userName,
        spotifyProfile: spotifyProfile,
        navLinks: navLinks,
        currentURL: req.originalUrl
    });
});

app.get("/login", (req, res) => {
    res.render("login", { authenticated: req.session.authenticated, navLinks, currentURL: req.originalUrl });
});

app.post("/loggingin", async (req, res) => {
    var email = req.body.email;
    var password = req.body.password;
    console.log(email);

    try {
        const userCollection = database.collection('users');
        const user = await userCollection.findOne({ email: email }, { projection: { password: 1, userName: 1, spotifyAccessToken: 1, spotifyRefreshToken: 1 } });

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

            // Refresh Spotify token if needed
            let spotifyProfile = null;
            if (user.spotifyAccessToken) {
                try {
                    const response = await axios.get('https://api.spotify.com/v1/me', {
                        headers: {
                            'Authorization': `Bearer ${user.spotifyAccessToken}`
                        }
                    });
                    spotifyProfile = response.data;
                } catch (error) {
                    if (error.response && error.response.status === 401 && user.spotifyRefreshToken) {
                        // Access token expired, refresh it
                        const tokenResponse = await axios({
                            method: 'post',
                            url: 'https://accounts.spotify.com/api/token',
                            headers: {
                                'Authorization': 'Basic ' + Buffer.from(spotify_client_id + ':' + spotify_client_secret).toString('base64'),
                                'Content-Type': 'application/x-www-form-urlencoded'
                            },
                            data: `grant_type=refresh_token&refresh_token=${user.spotifyRefreshToken}`
                        });

                        const newAccessToken = tokenResponse.data.access_token;

                        // Update user's access token in the database
                        await userCollection.updateOne(
                            { email: email },
                            { $set: { spotifyAccessToken: newAccessToken } }
                        );

                        const response = await axios.get('https://api.spotify.com/v1/me', {
                            headers: {
                                'Authorization': `Bearer ${newAccessToken}`
                            }
                        });
                        spotifyProfile = response.data;
                    } else {
                        console.error('Error fetching Spotify profile:', error);
                    }
                }
            }

            res.render('profile', {
                authenticated: req.session.authenticated,
                userName: req.session.userName,
                spotifyProfile: spotifyProfile,
                navLinks: navLinks,
                currentURL: req.originalUrl
            });
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
        res.redirect("/profile");
    } catch (error) {
        console.error(error);
        res.redirect("/signup");
    }
});

app.get("/signup", (req, res) => {
    res.render("signup", { authenticated: req.session.authenticated, navLinks, currentURL: req.originalUrl });
});

app.get('/signout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/home');
        }
        res.redirect('/');
    });
});

app.get('/auth/spotify',
    passport.authenticate('spotify', {
        scope: ['user-read-email', 'user-read-private'],
        showDialog: true
    })
);

app.get('/callback',
    passport.authenticate('spotify', { failureRedirect: '/' }),
    async (req, res) => {
        req.session.authenticated = true;
        const userCollection = database.collection('users');
        await userCollection.updateOne(
            { userName: req.session.userName },
            { $set: { spotifyId: req.user.id, spotifyAccessToken: req.user.accessToken, spotifyRefreshToken: req.user.refreshToken } }
        );
        res.redirect('/profile');
    }
);

app.get("/explore", async (req,res) => {
    const userCollection = database.collection('users');
    const result = await userCollection.find().limit(6).toArray();
    res.render("explore",{users:result})
})

app.get('/profile', async (req, res) => {
    if (!req.session.authenticated) {
        res.redirect('/login');
        return;
    }

    const userCollection = database.collection('users');
    const user = await userCollection.findOne({ userName: req.session.userName });

    let spotifyProfile = null;
    if (user && user.spotifyAccessToken) {
        try {
            const response = await axios.get('https://api.spotify.com/v1/me', {
                headers: {
                    'Authorization': `Bearer ${user.spotifyAccessToken}`
                }
            });
            spotifyProfile = response.data;
        } catch (error) {
            if (error.response && error.response.status === 401 && user.spotifyRefreshToken) {
                const tokenResponse = await axios({
                    method: 'post',
                    url: 'https://accounts.spotify.com/api/token',
                    headers: {
                        'Authorization': 'Basic ' + Buffer.from(spotify_client_id + ':' + spotify_client_secret).toString('base64'),
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    data: `grant_type=refresh_token&refresh_token=${user.spotifyRefreshToken}`
                });

                const newAccessToken = tokenResponse.data.access_token;

                await userCollection.updateOne(
                    { userName: req.session.userName },
                    { $set: { spotifyAccessToken: newAccessToken } }
                );

                const response = await axios.get('https://api.spotify.com/v1/me', {
                    headers: {
                        'Authorization': `Bearer ${newAccessToken}`
                    }
                });
                spotifyProfile = response.data;
            } else {
                console.error('Error fetching Spotify profile:', error);
            }
        }
    }

    res.render('profile', {
        authenticated: req.session.authenticated,
        userName: req.session.userName,
        spotifyProfile: spotifyProfile,
        navLinks: navLinks,
        currentURL: req.originalUrl
    });
});

app.post('/editprofile', async(req,res) => {
    const userCollection = database.collection('users');
    prompt1 = req.body.prompt1;
    prompt1ans = req.body.prompt1ans;

    prompt2 = req.body.prompt2;
    prompt2ans = req.body.prompt2ans;

    prompt3 = req.body.prompt3;
    prompt3ans = req.body.prompt3ans;

    prompt4 = req.body.prompt4;
    prompt4ans = req.body.prompt4ans;

    prompt5 = req.body.prompt5;
    prompt5ans = req.body.prompt5ans;

    username = req.session.username;

    const promptsdata = {
        prompt1:prompt1,
        prompt1ans:prompt1ans,
        prompt2:prompt2,
        prompt2ans:prompt2ans,
        prompt3:prompt3,
        prompt3ans:prompt3ans,
        prompt4:prompt4,
        prompt4ans:prompt4ans,
        prompt5:prompt5,
        prompt5ans:prompt5ans
    };

    const result = await userCollection.updateOne({username:username},{$set:promptsdata},{upsert:true})
    res.redirect('/profile')
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
