import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, Trans } from "@lingui/macro";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { env } from "next-runtime-env";

import { authClient } from "@kan/auth/client";

import Button from "~/components/Button";
import Input from "~/components/Input";
import { PageHead } from "~/components/PageHead";
import PatternedBackground from "~/components/PatternedBackground";

const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

type ForgotPasswordFormValues = z.infer<typeof ForgotPasswordSchema>;

export default function ForgotPasswordView() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(ForgotPasswordSchema),
  });

  const onSubmit = async (values: ForgotPasswordFormValues) => {
    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    const baseUrl = env("NEXT_PUBLIC_BASE_URL") || window.location.origin;

    const { error: resetError } = await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: `${baseUrl}/reset-password`,
    });

    setIsSubmitting(false);

    if (resetError) {
      setError(resetError.message || t`Unable to send reset link. Please try again.`);
      return;
    }

    setMessage(
      t`If an account exists for this email, we have sent password reset instructions.`,
    );
  };

  return (
    <>
      <PageHead title={t`Forgot Password | workos`} />
      <main className="h-screen bg-light-100 pt-20 dark:bg-dark-50 sm:pt-0">
        <div className="justify-top flex h-full flex-col items-center px-4 sm:justify-center">
          <div className="z-10 flex w-full flex-col items-center">
            <h1 className="mb-6 text-lg font-bold tracking-tight text-light-1000 dark:text-dark-1000">
              Workos
            </h1>
            <p className="mb-10 text-3xl font-bold tracking-tight text-light-1000 dark:text-dark-1000">
              {t`Reset your password`}
            </p>
            <div className="w-full rounded-lg border border-light-500 bg-light-300 px-4 py-10 dark:border-dark-400 dark:bg-dark-200 sm:max-w-md lg:px-10">
              <div className="sm:mx-auto sm:w-full sm:max-w-sm space-y-4">
                <p className="text-sm text-light-900 dark:text-dark-900">
                  <Trans>
                    Enter the email associated with your account and we&apos;ll
                    send you a link to reset your password.
                  </Trans>
                </p>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div>
                    <Input
                      {...register("email", { required: true })}
                      placeholder={t`Enter your email address`}
                    />
                    {errors.email && (
                      <p className="mt-2 text-xs text-red-400">
                        {t`Please enter a valid email address`}
                      </p>
                    )}
                  </div>
                  {error && (
                    <p className="mt-2 text-xs text-red-400">
                      {error}
                    </p>
                  )}
                  {message && (
                    <p className="mt-2 text-xs text-green-500">
                      {message}
                    </p>
                  )}
                  <Button
                    fullWidth
                    size="lg"
                    variant="secondary"
                    isLoading={isSubmitting}
                  >
                    {t`Send reset link`}
                  </Button>
                </form>
                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="mt-4 text-center text-sm text-light-900 underline dark:text-dark-900"
                >
                  {t`Back to login`}
                </button>
              </div>
            </div>
          </div>
          <PatternedBackground />
        </div>
      </main>
    </>
  );
}

