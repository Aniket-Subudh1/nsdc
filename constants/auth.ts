export const AUTH_CONTENT = {
    admin:{
        heading:"Welcome back, Admin!",
        subHeading:"Sign in with your email and password, then verify with the code sent to your registered email.",
        SubmitButtonText:"Login as Admin",
        PlaceholderMail:"admin@example.com",
        portal:"admin",
        ForgotPasswordUrl:"/admin/forgot-password",
        RedirectUrl:"/training-partner/login",
        SecondaryButtonText:"Login as Training Partner"
    },
    trainingPartner:{
        heading:"Welcome back, Training Partner!",
        subHeading:"Login as a training partner to manage your courses and trainees",
        SubmitButtonText:"Login as Training Partner",
        PlaceholderMail:"partner@example.com",
        portal:"training_partner",
        ForgotPasswordUrl:"/training-partner/forgot-password",
        RedirectUrl:"/admin/login",
        SecondaryButtonText:"Login as Admin"
    },
} as const;