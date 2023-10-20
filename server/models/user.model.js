import { Schema, model} from "mongoose";
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';


const userSchema = new Schema({
    fullName: {
        type: 'String',
        require: [true, 'Name is required'],
        minLength: [5, 'Name must be at least 5 character'],
        maxLength: [50, 'Name should be less than 50 characters'],
        lowercase: true, 
        trim: true,
    },
    email: {
        type: 'String',
        requires: [true, 'Email is required'],
        lowercase: true,
        trim: true,
        unique: true,
        match: [],
    },
    password: {
        type: 'String',
        required: [true, 'Password is required'],
        minLength: [8, 'Password mst be at least 8 character'],
        select: false
    },
    avatar: {
        public_id: {
            type: 'String'
        },
        secure_url: { 
            type: 'String'
        }
    },
    role: {
        type: 'String',
        enum: ['USER', 'ADMIN'],
        default: 'USER'
    },
    forgotPasswordToken: String,
    forgotPasswordExpiry: Date,
    subscription: {
        id: String,
        status: String
    }
},{
    timestamps: true
});

userSchema.pre('save', async function(){
    if (!this.isModified('password')) {
        return next();
    }
    this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods = {
    generateJWTToken: async function() {
        return await jwt.sign(
            { id: this._id, email: this.email, subscription: this.subscription, role: this.rol},
            process.env.JWT_SECRET,
            {
                expiresIn: process.env.JWT_EXPIRY,

            }
        )
    },
    comparePassword: function(plainTextPassowrd) {
        return bycrypt.compare(plainTextPassowrd, this.password);
    },

    generatePasswordResetToken: async function () {
        const resetToken = crypto.randomBytes(20).toString('hex');

        this.forgotPasswordToken = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex')

        this.forgotPasswordExpiry = Date.now() + 15 * 60 * 1000;  //15 min from now

        return resetToken;

    }

}

const User = model('User', userSchema);

export default User;