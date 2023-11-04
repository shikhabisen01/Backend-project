import User from "../models/user.model.js"
import AppError from "../utils/error.util.js";
import cloudinary from 'cloudinary';
import fs from 'fs/promises';
import sendEmail from "../utils/sendEmail.js";
import crypto from 'crypto';

const cookieOptions = {
    maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
    httpOnly: true,
    secure: true,
}

const  register = async (req,res,next) => {
    const{ fullName, email, password} = req.body;

    if(!fullName || !email || !password) {
        return next (new AppError('All fields are required', 400));
    }

    const userExists = await User.findOne({ email });

    if(userExists) {
        return next (new AppError('Email already exists', 400));
    }

    const user = await User.create({
        fullName,
        email,
        password,
        avatar: {
            public_id: email,
            secure_url: 'https://res.cloudinary.com/du9jzqlpt/image/upload/v1674647316/avatar_drzgxv.jpg',
        }

    });

    if (!user) {
        return next(new AppError('User registartion failed, please try again'))

    }

    // TODO: File upload

    // console.log('File Details > ',JSON.stringify(req.file));


    if (req.file) {
        try {
            const result = await cloudinary.v2.uploader.upload(req.file.path, {
                folder: 'lms',
                width: 250,
                height: 250,
                gravity: 'faces',
                crop: 'fill'
            });

            if (result) {
                user.avatar.public_id = result.public_id;
                user.avatar.secure_url = result.secure_url;
                

                ///Remove file from server

                fs.rm(`uploads/${req.file.filename}`)
            }
        } catch (e) {
            return next(
                new AppError(e || 'File not uploaded, please try again',500)
            )
        }

    }

    await user.save();

    user.password = undefined;

    const token = await user.generateJWTToken();

    res.cookie('token', token, cookieOptions);

    res.status(201).json({
        success: true,
        message: 'User registered successfully',
        user,
    })

};

const login = async (req, res, next ) => {

    try {

        const { email, password } = req.body;

        if (!email || !password) {
            return next (new AppError('All fields are required', 400));        
        }
    
        const user = await User.findOne({
            email
        }).select('+password');
    
        if (!user || !user.comparePassword(password)){
            return next(new AppError('Email or password does not match', 400))
        }
    
        const token = await user.generateJWTToken();

        user.password = undefined;
    
        res.cookie('token', token, cookieOptions);
    
        res.status(200).json({
            success: true,
            message: 'User logged in successfully',
            user,
        })
        
    } catch (e) {
        return next(new AppError(e.message, 500));
    }
};

const logout = (req, res ) => {
    res.cookie('token', null, {
        secure: true,
        maxAge: 0,
        httpOnly: true
    });

    res.status(200).json({
        success: true,
        message: 'User logged out successfully'
    })

};

const getProfile = async (req, res, next) => {

    try {
        const userId = req.user.id;
        const user = await User.findById(userId);

        res.status(200).json({
            success: true,
            message: 'User details',
            user,
        })
        
    } catch (e) {
        return next(new AppError('Failed to fetch profile details '))  
    }   
};

const forgotPassword = async (req, res, next) => {

    const {email} = req.body;

    if (!email) {
        return next(new AppError('Email is required', 400))       
    }

    const user = await User.findOne({email});

    if (!user) {
        return next(new AppError('Email not registered', 400))              
    }

    const resetToken = await user.generatePasswordResetToken();

    await user.save();

    const resetPasswordURL = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    console.log(resetPasswordURL);

    const subject = 'Reset Password';
    const message = `You can reset your password by clicking <a href=${resetPasswordURL}</a>\n If the above link does not work for some reason then the copy paste the link in new tab ${resetPasswordURL}.\n If you have not requested this, kindly ignore. `;

    try {

        await sendEmail(email, subject, message);

        res.status(200).json({
            success: true,
            message: `Reset password token has been sent to ${email} succcessfully`
        })
        
    } catch (e) {

        user.forgotPasswordExpiry = undefined;
        user.forgotPasswordToken = undefined;

        await user.save();
        return next(new AppError(e.message , 500))       

    }

}

const resetPassword = async (req, res) => {
    const { resetToken } = req.params;

    const { password } = req.body;

    const forgotPasswordToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

    const user = await User.findOne({
        forgotPasswordToken,
        forgotPasswordExpiry: { $gt: Date.now() }
    });

    if (!user) {
        return next(
            new AppError('Token is invalid or expired, please try again', 400)
        )
    }

    user.password = password;
    user.forgotPasswordToken = undefined;
    user.forgotPasswordExpiry = undefined;

    user.save();

    res.status(200)({
        success:true,
        message: 'Password changed successfully!'
    })
}

const changePassword = async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    const { id } = req.user;

    if(!oldPassword || !newPassword) {
        return next(
            new AppError('All fields are mandatory', 400)
        )
    }

    const user = await User.findById(id).select('+password');

    if(!user){
        return next(
            new AppError('User doen not exist', 400)
        )
    }

    const isPasswordValid = await user.comparePassword(oldPassword);

    if(!isPasswordValid){
        return next(
            new AppError('Invalid old password', 400)
        )
    }

    user.password = newPassword;

    await user.save();

    user.password = undefined;

    res.status(200).json({
        success: true,
        message: 'Password changed successfully!'
    })
}

const updateUser = async (req, res, next) => {
    const { fullName } = req.body;
    const { id } = req.params;

    const user = await User.findById(id);


    if (!user) {
        return next (
            new AppError('User does not exist', 400)
        )       
    }

    if (fullName) {
        user.fullName = fullName;
    }

    if (req.file) {
        await cloudinary.v2.uploader.destroy(user.avatar.public_id);

        try {
            const result = await cloudinary.v2.uploader.upload(req.file.path, {
                folder: 'lms',
                width: 250,
                height: 250,
                gravity: 'faces',
                crop: 'fill'
            });

            if (result) {
                user.avatar.public_id = result.public_id;
                user.avatar.secure_url = result.secure_url;
                
                ///Remove file from server

                fs.rm(`uploads/${req.file.filename}`);
            }
        } catch (e) {
            return next(
                new AppError(e || 'File not uploaded, please try again',500)
            )
        }

    }

    await user.save();

    res.status(200).json({
        success: true,
        message: 'User details updated successfully!',
    });    
}


export {
    register,
    login,
    logout,
    getProfile,
    forgotPassword,
    resetPassword,
    changePassword,
    updateUser
};

