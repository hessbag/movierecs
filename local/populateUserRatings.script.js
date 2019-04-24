var mongoose = require('mongoose');

let dev_db_url = "mongodb+srv://ahess:Runyourdayallweeklong%231@movierecs-jit0p.gcp.mongodb.net/test?retryWrites=true";
const mongoDB = process.env.MONGODB_URI || dev_db_url;
mongoose.connect(mongoDB, {useNewUrlParser: true});
mongoose.Promise = global.Promise;
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection failed:'));

var User = require('../models/user.model');
var Movie = require('../models/movie.model');
var UserRating = require('../models/user_rating.model');

const fs = require('fs');
const csv = require('csv-parser');

const ratingsPath = __dirname + '/data/ratings.csv';
const linksPath = __dirname + '/data/links.csv';
const moviesPath = __dirname + '/data/movies.csv';

var ratings = [];
var moviesDict = {};
var usersDict = {};

process.on('exit', function(code) {
    console.log(`Exiting with ${code}`);
});


loadCsvToArray(ratingsPath)
.then(async function(ratings) {
    var usernameList = [];
    var userLookup = {};
    // build list of usernames to lookup
    ratings.forEach(function(row) {
        if (userLookup[row.userId] != true) {
            userLookup[row.userId] = true;
            usernameList.push('trainer' + row.userId);
        }
    });
    var userDocs = await User.find({'username': { $in: usernameList}});
    userDocs.forEach(function(doc) {
        usersDict[Number(doc.username.slice(7))] = doc._id;
    });
    return loadCsvToArray(moviesPath);
})
.then(async function(movies) {
    var movieTitleToId = {};
    var titleList = [];
    var movieLookup = {};
    // build list of usernames to lookup
    movies.forEach(function(row) {
        if (movieLookup[row.movieId] != true) {
            movieLookup[row.movieId] = true;
            // get the row - assume there is a year at the end
            var title = row.title.slice(0, row.title.length - 6).trim();
            // if the title row does not end in a parenthesis then there is no year attached
            if (row.title.trim()[row.title.trim().length - 1] != ')') {
                // save the whole title row to title and 'NA' to the year property
                title = row.title.slice(0).trim();
            }
            movieTitleToId[title] = row.movieId;
            titleList.push(title);
        }
    });
    var movieDocs = await Movie.find({'title': { $in: titleList}});
    movieDocs.forEach(function(doc) {
        moviesDict[movieTitleToId[doc.title]] = doc._id;
    });
    return loadCsvToArray(ratingsPath);
})
.then(function(ratings) {

    var docArr = [];
    ratings.forEach(function(row) {

        let UR = new UserRating({
            user: mongoose.Types.ObjectId(usersDict[row.userId]),
            movie: mongoose.Types.ObjectId(moviesDict[row.movieId]),
            rating: Number(row.rating)
        });
        docArr.push(UR);
    })

    UserRating.insertMany(docArr, function(err, ur) {
        if (err) return console.error(err);
        ur.forEach(function(item) {
            User.findOneAndUpdate({'_id': item.user}, { $push: {ratings: item._id}}, {new: true, upsert: true}, function(err, usr) {
                if (err) return console.error(err);
                console.log(`${usr.username} assigned rating ${item._id}`);
            });
            Movie.findOneAndUpdate({'_id': item.movie}, { $push: {ratings: item._id}}, {new: true, upsert: true}, function(err, mov) {
                if (err) return console.error(err);
                console.log(mov);
                console.log(`${mov.title} assigned rating ${item._id}`);
            })
        })
        
    })
})

function loadCsvToArray(path) {
    return new Promise((resolve, reject) => {
        var arr = [];
        var stream = fs.createReadStream(path)
        .pipe(csv())
        .on('data', (row) => {
            arr.push(row);
        })
        .on('end', () => {
            console.log(`File at ${path} successfully stored in array`);
            resolve(arr);
        });
    });
}