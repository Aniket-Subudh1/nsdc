export type LoginPageProps = {
  heading: string;
  subHeading: string;
  submitButtonText: string;
  placeholderMail: string;
  portal: "admin" | "training_partner";
  forgotPasswordUrl: string;
  RedirectUrl?: string;
  SecondaryButtonText?: string;
};

export type ForgotPasswordPageProps = {
  heading: string;
  subHeading: string;
  placeholderMail: string;
  portal: "admin" | "training_partner";
  loginUrl: string;
  redirectUrl?: string;
  secondaryButtonText?: string;
};