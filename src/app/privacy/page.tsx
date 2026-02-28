import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function PrivacyPolicyPage() {
  return (
    <div className="container mx-auto max-w-3xl py-12 px-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold font-headline">Privacy Policy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-muted-foreground">
          <p>
            This is a placeholder for your {`application's`} privacy policy. You should replace this
            text with your own policy, detailing how you collect, use, and protect your {`users'`} data.
            {`It's`} important to be transparent with your users about their privacy.
          </p>
          <p>
            Our application, EVonGo, uses Firebase Authentication to handle user sign-up and
            login. When you sign in with Google, we receive your basic profile information, such as
            your name, email address, and profile picture, as permitted by you through the Google
            consent screen. We use this information solely to create and manage your account and
            personalize your experience within the app.
          </p>
          <p>
            We do not share your personal information with third parties except as necessary to provide
            our services or as required by law.
          </p>
          <p>
            For questions about our privacy practices, please contact us.
          </p>
          <Link href="/login" className="text-primary hover:underline mt-4 inline-block">
            &larr; Back to Login
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
