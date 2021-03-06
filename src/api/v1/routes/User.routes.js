const router = require("express").Router();
const { userCtrl, uploadCtrl } = require("../controllers");
const { auth, authAdmin, authSuperAdmin, authPanelUser, uploadImage } = require("../middlewares");

router.post("/register", userCtrl.register);

router.post("/activate", userCtrl.activateEmail);

router.post("/login", userCtrl.login);

router.post("/refresh_token", userCtrl.getAccessToken);

router.post("/forgot", userCtrl.forgotPassword);

router.post("/reset", auth, userCtrl.resetPassword);

router.get("/infor", auth, userCtrl.getUserInfor);

router.get("/all_infor", auth, authPanelUser, userCtrl.getUsersAllInfor);

router.get("/logout", userCtrl.logout);

router.patch("/update", auth, userCtrl.updateUser);

router.patch("/update_role/:id", auth, authAdmin, userCtrl.updateUsersRole);

router.post("/delete/:id", auth, authPanelUser, userCtrl.deleteUser);

router.post("/activeDelUser/:id", auth, authAdmin, userCtrl.activeDeletedUser);

router.post("/upload_avatar", uploadImage, auth, uploadCtrl.uploadAvatar);

// Social Login

// router.post("/google_login", userCtrl.googleLogin);

// router.post('/facebook_login', userCtrl.facebookLogin);

router.post("/userDeletionReason", userCtrl.userDeletionReason);

module.exports = router;
