const request = require('request');
const rp = require('request-promise');
const _ = require('lodash@4.8.2');
const channel = '#react';
const commentsBaseURL = "https://news.ycombinator.com/item?id=";

// Post newly fetched articles to slack channel
const postToSlackChannel = (articleArr, token, cb) => {
  const articles = articleArr.map((article) => {
    return {
      "author_name": article.by, 
      "title": article.title, 
      "title_link": article.url || commentsBaseURL+article.id,
      "text": `See comments @: ${commentsBaseURL+article.id}`
    };
  });
  
  const form = {
    token,
    channel,
    attachments: JSON.stringify(articles)
  };

  request.post('https://slack.com/api/chat.postMessage', {form}, (err, res, body) => {
    return cb(err, body);
  });
};

// Update existing article array in wt storage, if new ones are found
const updateTopNews = (dataArr, ctx, cb) => {
  ctx.storage.get((error, data) => {
    if (error) return cb(error);
    
    const topTen = data && data.topTen ? data.topTen : [];

    // Check if newly fetched articles exist in the top10 array
    const newStories = dataArr.filter((article) => {
      if (!_.some(topTen, {'id':article.id})) {
        return article;
      }
    });
    
    // Post to slack channel and update top10 array if new items exist
    if (!_.isEmpty(newStories)) {
      console.log(JSON.stringify(newStories));
      console.log("Post the above to slack");
      
      // Post to slack
      postToSlackChannel(newStories, ctx.secrets.token, (err, res) => {
        if (err) return cb(err);

        // Update topTen array
        data = { topTen:newStories.concat(topTen).slice(0,10) };
        
        // Save data to WT storage
        ctx.storage.set(data, (error) => {
          cb(error);
        });
      });
    } else {
      cb(null);
    }
  });
};

module.exports = (ctx, done) => {
  // Call hacker-news "topstories" endpoint (returns an array of 500 IDs) 
  request('https://hacker-news.firebaseio.com/v0/topstories.json', (error, response, body) => {

    // Break the ID array down to 10 items and fetch article objects for each. 
    const stories = JSON.parse(body).slice(0,10).map((id) => {
      return rp({uri: `https://hacker-news.firebaseio.com/v0/item/${id}.json`, json: true});
    });
    
    Promise.all(stories).then((res) => {
      const articleArr = res.filter((obj) => {
        // Filter out articles (by specific keywords)
        return obj.title.match(/react|redux|flux/i);
      });

      updateTopNews(articleArr, ctx, (err) => {
        if (err) return done(err);
        done(null, "Successful!");
      });
    });
  });  
};