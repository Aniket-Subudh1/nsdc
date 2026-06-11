export const AUTH_CONTENT = {
    admin:{
        heading:"Welcome back, Admin!",
        subHeading:"Sign in with your email and password, then verify with the code sent to your registered email.",
        SubmitButtonText:"Login as Admin",
        PlaceholderMail:"admin@example.com",
        portal:"admin",
        ForgotPasswordUrl:"/admin/forgot-password",
        RedirectUrl:"/training-partner/login",
        SecondaryButtonText:"Login as Training Center"
    },
    trainingPartner:{
        heading:"Welcome back, Training Center!",
        subHeading:"Login as a training center to manage your courses and trainees",
        SubmitButtonText:"Login as Training Center",
        PlaceholderMail:"center@example.com",
        portal:"training_partner",
        ForgotPasswordUrl:"/training-partner/forgot-password",
        RedirectUrl:"/admin/login",
        SecondaryButtonText:"Login as Admin"
    },
} as const;