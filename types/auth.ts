export type LoginPageProps = {
  heading: string;
  subHeading: string;
  submitButtonText: string;
  placeholderMail: string;
  portal: "admin" | "training_partner";
  RedirectUrl?: string;
  SecondaryButtonText?: string;
};