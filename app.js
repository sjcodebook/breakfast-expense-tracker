//jshint esversion:6
require('dotenv').config();
const express = require('express');
const ejs = require('ejs');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const findOrCreate = require('mongoose-findorcreate');
const date = require('date-and-time');
const uniqueValidator = require('mongoose-unique-validator');
const async = require('async');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const aboutContent = 'This is a breakfast expense tracker application';
const contactContent = 'Email: jainsanmati846@gmail.com';

let nameUser = '';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.set('view engine', 'ejs');

app.use(express.static(__dirname + '/public'));

app.use(
  session({
    secret: 'the little secret.',
    resave: false,
    saveUninitialized: false
  })
);

app.use(passport.initialize());
app.use(passport.session());

const uri = process.env.ATLAS_URI;
mongoose.connect(uri, {
  useNewUrlParser: true,
  useCreateIndex: true,
  useFindAndModify: false
});
const connection = mongoose.connection;
connection.once('open', () => {
  console.log('MongoDB connected');
});

const userSchema = mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: {
    type: String,
    index: true,
    unique: true,
    required: [true, 'Is Required']
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  createdAt: {
    type: Date,
    default: Date.now(),
    select: false
  }
});

const postSchema = {
  username: String,
  tea: Number,
  biscuits: Number,
  mathri: Number,
  prevBal: Number,
  totalBal: Number,
  createdAt: {
    type: Date,
    default: new Date()
  }
};

userSchema.plugin(uniqueValidator, {
  message: 'Must Be Unique.'
});
userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = new mongoose.model('user', userSchema);

passport.use(User.createStrategy());

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

const Post = mongoose.model('post', postSchema);

// ─── GET ROUTES ─────────────────────────────────────────────────────────────────
app.get('/', function(req, res) {
  if (req.isAuthenticated()) {
    res.redirect('/logged');
  } else {
    res.render('login');
  }
});

app.get('/register', function(req, res) {
  if (req.isAuthenticated()) {
    res.redirect('/logged');
  } else {
    res.render('register');
  }
});

app.get('/fail-attempt', function(req, res) {
  res.render('fail-attempt');
});

app.get('/logged', function(req, res) {
  if (req.isAuthenticated()) {
    Post.find({ username: nameUser }).exec(function(err, doc) {
      const finalDoc = doc;
      if (err) {
        console.log(err);
      } else if (Array.isArray(doc) && doc.length) {
        const arr = doc[doc.length - 1];
        Post.findById(arr._id, function(err, doc) {
          if (err) {
            console.log(err);
          } else {
            res.render('loggedFull', {
              username: nameUser,
              prevBal: doc.prevBal,
              totalBal: doc.totalBal,
              finalDoc: finalDoc
            });
          }
        });
      } else {
        // array is empty
        res.render('loggedFull', {
          username: nameUser,
          prevBal: 0,
          totalBal: 0,
          finalDoc: finalDoc
        });
      }
    });
  } else {
    res.redirect('/');
  }
});

app.get('/logout', function(req, res) {
  req.logout();
  res.redirect('/');
});

app.get('/about', function(req, res) {
  res.render('about', {
    about: aboutContent
  });
});

app.get('/contact', function(req, res) {
  res.render('contact', {
    contact: contactContent
  });
});

app.get('/delete', function(req, res) {
  if (req.isAuthenticated()) {
    Post.deleteMany({ username: nameUser }, function(err) {
      if (err) console.log(err);
      res.redirect('/');
    });
  } else {
    res.redirect('/');
  }
});

app.get('/deleteSpecific', function(req, res) {
  if (req.isAuthenticated()) {
    const l = req.originalUrl;
    let from = l.substring(21, 31);
    let to = l.substring(35, l.length);

    Post.deleteMany({
      username: nameUser,
      createdAt: {
        $gte: from,
        $lte: to
      }
    }).exec(function(err, doc) {
      res.redirect('/');
    });
  } else {
    res.redirect('/');
  }
});

// ─── POST ROUTES ────────────────────────────────────────────────────────────────
app.post('/', function(req, res) {
  const user = new User({
    username: req.body.username,
    password: req.body.password
  });
  User.find({ username: req.body.username }).exec(function(err, doc) {
    if (Array.isArray(doc) && doc.length) {
      req.login(user, function(err) {
        if (err) {
          console.log(err);
        } else {
          passport.authenticate('local', { failureRedirect: '/fail-attempt' })(
            req,
            res,
            function() {
              nameUser = req.body.username;
              res.redirect('/logged');
            }
          );
        }
      });
    } else {
      res.render('not-found');
    }
  });
});

app.post('/logged', function(req, res) {
  if (req.isAuthenticated()) {
    const post = new Post({
      username: nameUser,
      tea: req.body.tea,
      biscuits: req.body.biscuits,
      mathri: req.body.mathri,
      prevBal: req.body.prevBal,
      totalBal: req.body.totalBal
    });
    post.save(function(err) {
      if (err) {
        console.log(err);
      }
      res.redirect('/logged');
    });
  } else {
    res.redirect('/');
  }
});

app.post('/register', function(req, res) {
  User.register(
    { username: req.body.username, email: req.body.email },
    req.body.password,
    function(err, user) {
      if (err) {
        console.log(err);

        res.render('fail-register', {
          message: err.message
        });
      } else {
        res.render('success-register');
      }
    }
  );
});

// ─── PASSWORD RECOVERY ──────────────────────────────────────────────────────────
app.get('/pass-recovery', function(req, res) {
  res.render('forgot');
});

app.post('/pass-recovery', function(req, res, next) {
  async.waterfall(
    [
      function(done) {
        crypto.randomBytes(20, function(err, buf) {
          var token = buf.toString('hex');
          done(err, token);
        });
      },
      function(token, done) {
        User.findOne({ email: req.body.email }, function(err, user) {
          if (!user) {
            return res.render('forgotmsg', {
              message: 'Email Address Doesnot Exist'
            });
          }

          user.resetPasswordToken = token;
          user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

          user.save(function(err) {
            done(err, token, user);
          });
        });
      },
      function(token, user, done) {
        var smtpTransport = nodemailer.createTransport({
          service: 'Gmail',
          auth: {
            user: 'ted.mcgrath.woodworks@gmail.com',
            pass: process.env.GMAILPW
          }
        });
        var mailOptions = {
          to: user.email,
          from: 'pass-reset@payrolltracker.com',
          subject: 'Node.js Password Reset',
          text:
            'You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n' +
            'Please click on the following link, or paste this into your browser to complete the process (Link will expire after one hour):\n\n' +
            'https://' +
            req.headers.host +
            '/reset/' +
            token +
            '\n\n' +
            'If you did not request this, please ignore this email and your password will remain unchanged.\n'
        };
        smtpTransport.sendMail(mailOptions, function(err) {
          console.log('mail sent');
          res.render('forgotmsg', {
            message: `Success, An E-Mail Has Been Sent To ${user.email} With Further Instructions.`
          });
          done(err, 'done');
        });
      }
    ],
    function(err) {
      if (err) return next(err);
      res.redirect('/pass-recovery');
    }
  );
});

app.get('/reset/:token', function(req, res) {
  User.findOne(
    {
      resetPasswordToken: req.params.token,
      resetPasswordExpires: { $gt: Date.now() }
    },
    (err, user) => {
      if (!user) {
        return res.render('forgotmsg', {
          message: 'Error, Password reset token is invalid or has expired.'
        });
      }
      res.render('reset', { token: req.params.token });
    }
  );
});

app.post('/reset/:token', function(req, res) {
  async.waterfall(
    [
      function(done) {
        User.findOne(
          {
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }
          },
          function(err, user) {
            if (!user) {
              return res.render('forgotmsg', {
                message:
                  'Error, Password reset token is invalid or has expired.'
              });
            }
            if (req.body.password === req.body.confirm) {
              user.setPassword(req.body.password, function(err) {
                user.resetPasswordToken = undefined;
                user.resetPasswordExpires = undefined;
                nameUser = user.username;

                user.save(function(err) {
                  req.logIn(user, function(err) {
                    done(err, user);
                  });
                });
              });
            } else {
              return res.render('resetmsg', {
                message: 'Passwords Do Not Match.',
                token: req.params.token
              });
            }
          }
        );
      },
      function(user, done) {
        var smtpTransport = nodemailer.createTransport({
          service: 'Gmail',
          auth: {
            user: 'ted.mcgrath.woodworks@gmail.com',
            pass: process.env.GMAILPW
          }
        });
        var mailOptions = {
          to: user.email,
          from: 'pass-reset@payrolltracker.com',
          subject: 'Your password has been changed',
          text:
            'Hello,\n\n' +
            'This is a confirmation that the password for your account ' +
            user.email +
            ' has just been changed.\n'
        };
        smtpTransport.sendMail(mailOptions, function(err) {
          // req.flash('success', 'Success! Your password has been changed.');
          done(err);
        });
      }
    ],
    function(err) {
      res.redirect('/');
    }
  );
});

// ─── ERROR PAGE ─────────────────────────────────────────────────────────────────
app.all('*', (req, res) => {
  res.render('404');
});

// ─── SERVER ─────────────────────────────────────────────────────────────────────
let port = process.env.PORT;
if (port == null || port == '') {
  port = 3000;
}

app.listen(port, function() {
  console.log(`Server started at ${port}`);
});
