/* eslint-disable new-cap */
/* eslint-disable eqeqeq */
/* eslint-disable camelcase */
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
require("dotenv").config();
const os = require("os");
const { v4: uuid } = require("uuid");
const { NONAME } = require("dns");
const { google } = require("googleapis");
const {
  server: { domain },
  staticFilesUrlRoute,
  showDevLogsAndResponse
} = require("../../../../config/appConfig");
const User = require("../models/User.model");
const { standardResponse } = require("../helpers");
const sendMail = require("./sendMail");

const { OAuth2 } = google.auth;
const client = new OAuth2(process.env.MAILING_SERVICE_CLIENT_ID);
const { CLIENT_URL } = process.env;
const errCatchResObjRetFn = (res, error) => {
  const { message } = error && error.errors && error.errors[0] ? error.errors[0] : "";
  let resObj = {
    res,
    isError: true,
    message: "",
    responseStatusCode: null,
    msg: message
  };
  resObj = showDevLogsAndResponse
    ? {
        ...resObj,
        err: error
      }
    : {
        ...resObj
      };
  return resObj;
};
function validateEmail(email) {
  const re =
    /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(email);
}

function validateMobileNumber(number) {
  if (
    (number.slice(0, 3) === "+91" && number.length === 13) ||
    (number.slice(0, 1) === "0" && number.length === 11) ||
    number.length === 10
  ) {
    return true;
  }
  return false;
}
const createActivationToken = (payload) =>
  jwt.sign(payload, process.env.ACTIVATION_TOKEN_SECRET, {
    expiresIn: "5m"
  });
const createAccessToken = (payload) =>
  jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "15m"
  });
const createRefreshToken = (payload) =>
  jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: "7d"
  });
const register = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      employeeId,
      email,
      password,
      confirmPassword,
      role,
      mobile_number,
      whatsapp_number,
      office_location,
      address,
      reporting_to
    } = req.body;

    if (
      !firstName ||
      !lastName ||
      !employeeId ||
      !email ||
      !password ||
      !mobile_number ||
      !address ||
      !confirmPassword
    ) {
      return res.status(400).json({
        msg: "Please fill in all fields."
      });
    }
    const WhatsAppNumber = whatsapp_number || mobile_number;
    if (!validateMobileNumber(mobile_number)) {
      return res.status(500).json({
        msg: "invalid mobile number"
      });
    }
    if (!validateMobileNumber(whatsapp_number)) {
      return res.status(500).json({
        msg: "invalid whatsapp number"
      });
    }
    const Role = role || 0;
    if (!validateEmail(email)) {
      return res.status(400).json({
        msg: "Invalid emails."
      });
    }

    const user = await User.findOne({
      email
    });
    if (user) {
      return res.status(400).json({
        msg: "This email already exists."
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        msg: "Password must be at least 6 characters."
      });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({
        msg: "Password does not match"
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const newUser = {
      firstName,
      lastName,
      employeeId,
      email,
      password: passwordHash,
      mobile_number,
      whatsapp_number: WhatsAppNumber,
      role: Role,
      address,
      office_location,
      reporting_to
    };

    const activation_token = createActivationToken(newUser);

    const url = `${CLIENT_URL}/user/activate/${activation_token}`;
    // sendMail(email, url, "Verify your email address");

    res.json({
      msg: "Register Success! Please activate your email to start.",
      token: activation_token
    });
  } catch (err) {
    return res.status(500).json({
      msg: err.message
    });
  }
};
const activateEmail = async (req, res) => {
  try {
    const { activation_token } = req.body;

    const user = jwt.verify(activation_token, process.env.ACTIVATION_TOKEN_SECRET);
    const {
      firstName,
      lastName,
      employeeId,
      email,
      password,
      role,
      mobile_number,
      whatsapp_number,
      office_location,
      address,
      reporting_to
    } = user;

    const check = await User.findOne({
      email
    });
    if (check) {
      return res.status(400).json({
        msg: "This email already exists."
      });
    }

    const newUser = new User({
      firstName,
      lastName,
      employeeId,
      email,
      password,
      mobile_number,
      whatsapp_number,
      role,
      address,
      office_location,
      reporting_to
    });

    await newUser.save();

    res.json({
      msg: "Account has been activated!"
    });
  } catch (err) {
    return res.status(500).json({
      msg: err.message
    });
  }
};
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({
      email
    });
    if (!user) {
      return res.status(400).json({
        msg: "This email does not exist."
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        msg: "Password is incorrect."
      });
    }

    const refresh_token = createRefreshToken({
      id: user._id
    });
    res.cookie("refreshtoken", refresh_token, {
      httpOnly: true,
      path: "/api/v1/user/refresh_token",
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      msg: "Login success!"
    });
  } catch (err) {
    return res.status(500).json({
      msg: err.message
    });
  }
};
const getAccessToken = (req, res) => {
  try {
    const rf_token = req.cookies.refreshtoken;
    if (!rf_token) {
      return res.status(400).json({
        msg: "Please login now!"
      });
    }

    jwt.verify(rf_token, process.env.REFRESH_TOKEN_SECRET, (err, user) => {
      if (err) {
        return res.status(400).json({
          msg: "Please login now!"
        });
      }

      const access_token = createAccessToken({
        id: user.id
      });
      res.json({
        access_token
      });
    });
  } catch (err) {
    return res.status(500).json({
      msg: err.message
    });
  }
};
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({
      email
    });
    if (!user) {
      return res.status(400).json({
        msg: "This email does not exist."
      });
    }

    const access_token = createAccessToken({
      id: user._id
    });
    const url = `${CLIENT_URL}/user/reset/${access_token}`;

    sendMail(email, url, "Reset your password");
    res.json({
      msg: "Re-send the password, please check your email."
    });
  } catch (err) {
    return res.status(500).json({
      msg: err.message
    });
  }
};
const resetPassword = async (req, res) => {
  try {
    const { password } = req.body;
    console.log(password);
    const passwordHash = await bcrypt.hash(password, 12);

    await User.findOneAndUpdate(
      {
        _id: req.user.id
      },
      {
        password: passwordHash
      }
    );

    res.json({
      msg: "Password successfully changed!"
    });
  } catch (err) {
    return res.status(500).json({
      msg: err.message
    });
  }
};
const getUserInfor = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    res.json(user);
  } catch (err) {
    return res.status(500).json({
      msg: err.message
    });
  }
};
const getUsersAllInfor = async (req, res) => {
  const { pageNo } = req.query;
  const userIndex = (pageNo - 1) * 20;
  try {
    const count = await User.find({
      role: {
        $lt: req.user.role
      }
    }).count();
    if (userIndex > count) {
      return res.json({
        message: "No Data Available"
      });
    }
    const users = await User.find({
      role: {
        $lt: req.user.role
      }
    })
      .select("-password")
      .limit(20)
      .skip(userIndex);
    res.json({
      message: `Displaying Document ${userIndex + 1} - ${userIndex + users.length} of ${count} `,
      users
    });
  } catch (err) {
    return res.status(500).json({
      msg: err.message
    });
  }
};
const logout = async (req, res) => {
  try {
    res.clearCookie("refreshtoken", {
      path: "/api/v1/user/refresh_token"
    });
    return res.json({
      msg: "Logged out."
    });
  } catch (err) {
    return res.status(500).json({
      msg: err.message
    });
  }
};
const updateUser = async (req, res) => {
  try {
    const { name, avatar } = req.body;
    await User.findOneAndUpdate(
      {
        _id: req.user.id
      },
      {
        name,
        avatar
      }
    );

    res.json({
      msg: "Update Success!"
    });
  } catch (err) {
    return res.status(500).json({
      msg: err.message
    });
  }
};
const updateUsersRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (role >= req.user.role) {
      return res.status(500).json({
        msg: "Role Updattion Access Denied"
      });
    }

    await User.findOneAndUpdate(
      {
        _id: req.params.id
      },
      {
        role
      }
    );

    res.json({
      msg: "Update Success!"
    });
  } catch (err) {
    return res.status(500).json({
      msg: err.message
    });
  }
};
const deleteUser = async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id
    });
    if (user.status === 0) {
      return res.json({
        message: "user is already deactivate!"
      });
    }
    await User.updateOne(
      {
        _id: req.params.id
      },
      {
        status: 0
      }
    );

    res.json({
      msg: "User Deactivated!"
    });
  } catch (err) {
    return res.status(500).json({
      msg: err.message
    });
  }
};
const activeDeletedUser = async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id
    });
    if (user.status === 1) {
      return res.json({
        message: "user is already activate!"
      });
    }
    await User.updateOne(
      {
        _id: req.params.id
      },
      {
        status: 1
      }
    );

    res.json({
      msg: "User Activated!"
    });
  } catch (err) {
    return res.status(500).json({
      msg: err.message
    });
  }
};
// const googleLogin = async (req, res) => {
//   try {
//     const { tokenId } = req.body;

//     const verify = await client.verifyIdToken({
//       idToken: tokenId,
//       audience: process.env.MAILING_SERVICE_CLIENT_ID
//     });

//     const { email_verified, email, name, picture } = verify.payload;

//     const password = email + process.env.GOOGLE_SECRET;

//     const passwordHash = await bcrypt.hash(password, 12);

//     if (!email_verified) {
//       return res.status(400).json({
//         msg: "Email verification failed."
//       });
//     }

//     const user = await User.findOne({
//       email
//     });

//     if (user) {
//       const isMatch = await bcrypt.compare(password, user.password);
//       if (!isMatch) {
//         return res.status(400).json({
//           msg: "Password is incorrect."
//         });
//       }

//       const refresh_token = createRefreshToken({
//         id: user._id
//       });
//       res.cookie("refreshtoken", refresh_token, {
//         httpOnly: true,
//         path: "/api/v1/user/refresh_token",
//         maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
//       });

//       res.json({
//         msg: "Login success!"
//       });
//     } else {
//       const newUser = new User({
//         name,
//         email,
//         password: passwordHash,
//         avatar: picture
//       });

//       await newUser.save();

//       const refresh_token = createRefreshToken({
//         id: newUser._id
//       });
//       res.cookie("refreshtoken", refresh_token, {
//         httpOnly: true,
//         path: "/api/v1/user/refresh_token",
//         maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
//       });

//       res.json({
//         msg: "Login success!"
//       });
//     }
//   } catch (err) {
//     return res.status(500).json({
//       msg: err.message
//     });
//   }
// };
// const facebookLogin = async (req, res) => {
//     try {
//         const {accessToken, userID} = req.body

//         const URL = `https://graph.facebook.com/v2.9/${userID}/?fields=id,name,email,picture&access_token=${accessToken}`

//         const data = await fetch(URL).then(res => res.json()).then(res => {return res})

//         const {email, name, picture} = data

//         const password = email + process.env.FACEBOOK_SECRET

//         const passwordHash = await bcrypt.hash(password, 12)

//         const user = await Users.findOne({email})

//         if(user){
//             const isMatch = await bcrypt.compare(password, user.password)
//             if(!isMatch) return res.status(400).json({msg: "Password is incorrect."})

//             const refresh_token = createRefreshToken({id: user._id})
//             res.cookie('refreshtoken', refresh_token, {
//                 httpOnly: true,
//                 path: '/user/refresh_token',
//                 maxAge: 7*24*60*60*1000 // 7 days
//             })

//             res.json({msg: "Login success!"})
//         }else{
//             const newUser = new Users({
//                 name, email, password: passwordHash, avatar: picture.data.url
//             })

//             await newUser.save()

//             const refresh_token = createRefreshToken({id: newUser._id})
//             res.cookie('refreshtoken', refresh_token, {
//                 httpOnly: true,
//                 path: '/api/v1/user/refresh_token',
//                 maxAge: 7*24*60*60*1000 // 7 days
//             })

//             res.json({msg: "Login success!"})
//         }

//     } catch (err) {
//         return res.status(500).json({msg: err.message})
//     }
// }
const userDeletionReason = async (req, res) => {
  const message = [
    "Not working with Qloron anymore",
    "User already exists with another email/ phone number",
    "Wrong info added",
    "Is on Paternal/ Maternal/ Sabbatical Leave",
    "Other"
  ];
  standardResponse({
    res,
    isError: false,
    data: message,
    responseStatusCode: 200,
    successCode: 200
  });
};
module.exports = {
  register,
  activateEmail,
  login,
  getAccessToken,
  forgotPassword,
  resetPassword,
  getUserInfor,
  getUsersAllInfor,
  logout,
  updateUser,
  updateUsersRole,
  deleteUser,
  activeDeletedUser,
  // googleLogin,
  // facebookLogin,
  userDeletionReason
};
