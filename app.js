const express = require("express");
const app = express();
app.use(express.json());

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const path = require("path");
const dbPath = path.join(__dirname, "twitterClone.db");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

const authenticationToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "My_secret_code", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};
// API 1 Register New User
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  let DbUser = null;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const getUsernameQuery = `
    SELECT * FROM user
    WHERE username = '${username}';`;
  DbUser = await db.get(getUsernameQuery);

  if (DbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      addNewUserQuery = `
        INSERT INTO 
            user(username , password , name , gender)
        VALUES( '${username}' , '${hashedPassword}', '${name}', '${gender}');`;
      DbUser = await db.run(addNewUserQuery);
      console.log(DbUser);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});
// API 2 Login
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUsernameQuery = `
    SELECT * FROM user
    WHERE username = '${username}';`;
  const dbUser = await db.get(getUsernameQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isValidPassword = await bcrypt.compare(password, dbUser.password);
    if (isValidPassword === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "My_secret_code");
      response.status(200);
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});
//API 3
app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    const { username } = request;
    console.log(username);
    const getTweetQuery = `
    SELECT 
        user.username,
        tweet.tweet,
        tweet.date_time AS dateTime
    FROM user
        INNER JOIN 
        tweet
    ON user.user_id = tweet.user_id
    WHERE username = '${username}'
    LIMIT 4;`;
    const feed = await db.all(getTweetQuery);
    response.send(feed);
  }
);

// API 4 Returns the list of all names of people whom the user follows
app.get("/user/following/", authenticationToken, async (request, response) => {
  const { username } = request;
  console.log(username);
  const getListOfUserFollows = `
    SELECT 
        follower.following_user_id
    FROM 
        follower
    INNER JOIN user
    ON follower.follower_user_id = user.user_id
    WHERE username = '${username}';`;
  const dbResponse = await db.all(getListOfUserFollows);
  console.log(dbResponse);
  const following = await dbResponse.map(async (eachItem) => {
    const getTheName = `
    SELECT 
        user.username
    FROM 
        user
    INNER JOIN follower
    ON user.user_id = follower.follower_user_id
    WHERE user.user_id = '${eachItem.following_user_id}';`;
    const dbResult = await db.get(getTheName);
    return dbResult;
  });

  console.log(following);
  response.send(following);
});

//API 5 Returns the list of all names of people who follows the user
