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
const getUserId = async (username) => {
  // get the userId
  const getUserIDQuery = ` 
  SELECT user_id FROM user
  WHERE username = '${username}';`;
  const userId = await db.get(getUserIDQuery);
  return userId;
};
const getTheUserFollowingUserDetails = async (userId, tweetId) => {
  // get the tweet of the tweetId
  const getTweetQuery = `
  SELECT * FROM tweet
  WHERE tweet_id = '${tweetId}';`;
  const tweetResult = await db.get(getTweetQuery);
  // get the details of the user whom the user is following
  const getFollowingUserQuery = `
  SELECT * FROM user
  INNER JOIN follower
  ON user.user_id = follower.following_user_id;
  WHERE follower.following_user_id = '${userId.user_id}'`;
  const userFollowingResult = await db.all(getFollowingUserQuery);
  if (
    userFollowingResult.some(
      (item) => item.following_user_id === tweetResult.user_id
    )
  ) {
    return true;
  } else {
    return false;
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
//API 3 Returns the latest tweets of people whom the user follows. Return 4 tweets at a time
app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    const { username } = request;
    const userId = await getUserId(username);
    const getTweetQuery = `
    SELECT 
        user.username,
        tweet.tweet,
        tweet.date_time AS dateTime
    FROM user
    INNER JOIN tweet ON user.user_id = tweet.user_id
    INNER JOIN follower ON tweet.user_id = follower.follower_user_id
    WHERE  follower.following_user_id= '${userId.user_id}'
    ORDER BY tweet.tweet_id DESC
    LIMIT 4;`;
    const feed = await db.all(getTweetQuery);
    response.send(feed);
  }
);

// API 4 Returns the list of all names of people whom the user follows
app.get("/user/following/", authenticationToken, async (request, response) => {
  const { username } = request;
  const userId = await getUserId(username);
  const getListOfUserFollows = `
    SELECT 
        user.name
    FROM 
        follower
    INNER JOIN user
    ON  user.user_id= follower.follower_user_id 
    WHERE follower.following_user_id  = '${userId.user_id}';`;
  const following = await db.all(getListOfUserFollows);
  console.log(following);
  response.send(following);
});

//API 5 Returns the list of all names of people who follows the user
app.get("/user/followers/", authenticationToken, async (request, response) => {
  const { username } = request;
  const getUserIDQuery = `
  SELECT 
    user_id
  FROM 
    user
WHERE username = '${username}';`;
  const userId = await db.get(getUserIDQuery);
  console.log(userId);
  const getNamesOfUserFollowers = `
  SELECT 
    user.name
  FROM 
    user
  INNER JOIN 
    follower
  ON user.user_id = follower.follower_user_id
  WHERE follower.following_user_id = '${userId.user_id}';`;
  const followers = await db.all(getNamesOfUserFollowers);
  response.send(followers);
});

//API 6 If the user requests a tweet of the user he is following, return the tweet, likes count, replies count and date-time
app.get("/tweets/:tweetId/", authenticationToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const userId = await getUserId(username);
  const result = await getTheUserFollowingUserDetails(userId, tweetId);
  // check if the requested tweet is by the user whom the user is following
  if (result === true) {
    const getTweetsQuery = `
    SELECT 
        tweet.tweet,
        COUNT(DISTINCT like.like_id) AS likes,
        COUNT(DISTINCT reply.reply_id) AS replies,
        tweet.date_time AS dateTime
    FROM follower
    INNER JOIN tweet ON follower.follower_user_id = tweet.user_id
    INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
    INNER JOIN like ON reply.tweet_id = like.tweet_id
    WHERE tweet.tweet_id = '${tweetId}'
    AND follower.following_user_id = '${userId.user_id}'
    GROUP BY tweet.tweet_id
    ;`;
    const tweets = await db.get(getTweetsQuery);
    response.send(tweets);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

// API 7 If the user requests a tweet of a user he is following, return the list of usernames who liked the tweet
app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const userId = await getUserId(username);
    const result = await getTheUserFollowingUserDetails(userId, tweetId);
    if (result === true) {
      const getTweetsQuery = `
        SELECT
        user.name
        FROM follower
        INNER JOIN tweet ON follower.follower_user_id = tweet.user_id
        INNER JOIN like ON tweet.tweet_id = like.tweet_id
        INNER JOIN user ON like.user_id = user.user_id
        WHERE follower.following_user_id = '${userId.user_id}'
        AND tweet.tweet_id = '${tweetId}'
        ;`;
      let likes = await db.all(getTweetsQuery);
      likes = likes.map((item) => Object.values(item));
      console.log(likes);
      response.send(`"likes": '${JSON.stringify(likes)}'`);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

// API 8 If the user requests a tweet of a user he is following, return the list of replies.
app.get(
  "/tweets/:tweetId/replies/",
  authenticationToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const userId = await getUserId(username);
    const result = await getTheUserFollowingUserDetails(userId, tweetId);
    console.log(result);
    if (result === true) {
      const getTweetsQuery = `
    SELECT 
        user.name,
        reply.reply
    FROM follower
    INNER JOIN tweet ON follower.follower_user_id = tweet.user_id
    INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
    INNER JOIN user ON reply.user_id = user.user_id
    WHERE follower.following_user_id = '${userId.user_id}'
    AND tweet.tweet_id = '${tweetId}'
    ;`;
      const replies = await db.all(getTweetsQuery);
      response.send(replies);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
// API 9 Returns a list of all tweets of the user
app.get("/user/tweets/", authenticationToken, async (request, response) => {
  const { username } = request;
  const userId = await getUserId(username);

  const getTweetsQuery = `
  SELECT
    tweet.tweet,
    COUNT(DISTINCT like.like_id) AS likes ,
    COUNT(DISTINCT reply.reply_id) AS replies,
    tweet.date_time AS dateTime
  FROM tweet
  INNER JOIN reply ON (tweet.tweet_id = reply.tweet_id)
  INNER JOIN like ON reply.tweet_id = like.tweet_id
  WHERE tweet.user_id = '${userId.user_id}'
  GROUP BY tweet.tweet
  ;`;

  const tweets = await db.all(getTweetsQuery);
  response.send(tweets);
});

//API 10 Create a tweet in the tweet table
app.post("/user/tweets/", authenticationToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  const myDate = new Date();
  const dateTime = `${myDate.getFullYear()}-${
    myDate.getMonth() + 1
  }-${myDate.getDate()} ${myDate.getHours()}:${myDate.getMinutes()}:${myDate.getSeconds()}`;
  console.log(dateTime);

  const getUserIDQuery = `
  SELECT 
    user_id
  FROM 
    user
WHERE username = '${username}';`;
  const userId = await db.get(getUserIDQuery);
  console.log(userId);

  const creatTweetQuery = `
    INSERT INTO 
        tweet(tweet , user_id , date_time)
    VALUES('${tweet}','${userId.user_id}', '${dateTime}');`;
  const tweets = await db.run(creatTweetQuery);
  console.log(tweets);
  response.send("Created a Tweet");
});

//API 11 If the user deletes his tweet
app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const userId = await getUserId(username);
    const getTheUserTweet = `
    SELECT * FROM tweet
    WHERE tweet_id = '${tweetId}'
    AND user_id = '${userId.user_id}';`;
    const result = await db.get(getTheUserTweet);
    console.log(result);
    if (result !== undefined) {
      const deleteTweetQuery = `
    DELETE FROM tweet
    WHERE tweet_id = '${tweetId}'
    AND user_id = '${userId.user_id}'
    ;`;
      const tweets = await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
