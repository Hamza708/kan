import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { t, Trans } from "@lingui/macro";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { authClient } from "@kan/auth/client";

import Button from "~/components/Button";
import Input from "~/components/Input";
import { PageHead } from "~/components/PageHead";
import PatternedBackground from "~/components/PatternedBackground";

const ResetPasswordSchema = z
  .object({
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: t`Passwords do not match`,
    path: ["confirmPassword"],
  });

type ResetPasswordFormValues = z.infer<typeof ResetPasswordSchema>;

export default function ResetPasswordView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInvalidToken, setIsInvalidToken] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(ResetPasswordSchema),
  });

  useEffect(() => {
    const urlToken = searchParams.get("token");
    const hasError = searchParams.get("error");

    if (hasError) setIsInvalidToken(true);
    if (urlToken) setToken(urlToken);
  }, [searchParams]);

  const onSubmit = async (values: ResetPasswordFormValues) => {
    if (!token) {
      setError(t`Reset link is invalid or has expired.`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const { error: resetError } = await authClient.resetPassword({
      newPassword: values.password,
      token,
    });

    setIsSubmitting(false);

    if (resetError) {
      setError(
        resetError.message || t`Unable to reset password. Please try again.`,
      );
      return;
    }

    router.push("/login");
  };

  const renderInvalidToken = () => {
    return (
      <div className="w-full rounded-lg border border-light-500 bg-light-300 px-4 py-10 text-center dark:border-dark-400 dark:bg-dark-200 sm:max-w-md lg:px-10">
        <p className="mb-4 text-sm text-light-900 dark:text-dark-900">
          {t`This password reset link is invalid or has expired.`}
        </p>
        <Button
          fullWidth
          size="lg"
          variant="secondary"
          onClick={() => router.push("/forgot-password")}
        >
          {t`Request a new reset link`}
        </Button>
      </div>
    );
  };

  return (
    <>
      <PageHead title={t`Reset Password | workos`} />
      <main className="h-screen bg-light-100 pt-20 dark:bg-dark-50 sm:pt-0">
        <div className="justify-top flex h-full flex-col items-center px-4 sm:justify-center">
          <div className="z-10 flex w-full flex-col items-center">
            <h1 className="mb-6 text-lg font-bold tracking-tight text-light-1000 dark:text-dark-1000">
              Workos
            </h1>
            <p className="mb-10 text-3xl font-bold tracking-tight text-light-1000 dark:text-dark-1000">
              {t`Create a new password`}
            </p>
            {isInvalidToken && !token && renderInvalidToken()}
            {!isInvalidToken && token && (
              <div className="w-full rounded-lg border border-light-500 bg-light-300 px-4 py-10 dark:border-dark-400 dark:bg-dark-200 sm:max-w-md lg:px-10">
                <div className="sm:mx-auto sm:w-full sm:max-w-sm space-y-4">
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div>
                      <Input
                        type="password"
                        {...register("password", { required: true })}
                        placeholder={t`Enter your new password`}
                      />
                      {errors.password && (
                        <p className="mt-2 text-xs text-red-400">
                          {errors.password.message ??
                            t`Please enter a valid password`}
                        </p>
                      )}
                    </div>
                    <div>
                      <Input
                        type="password"
                        {...register("confirmPassword", { required: true })}
                        placeholder={t`Confirm your new password`}
                      />
                      {errors.confirmPassword && (
                        <p className="mt-2 text-xs text-red-400">
                          {errors.confirmPassword.message ??
                            t`Passwords do not match`}
                        </p>
                      )}
                    </div>
                    {error && (
                      <p className="mt-2 text-xs text-red-400">
                        {error}
                      </p>
                    )}
                    <Button
                      fullWidth
                      size="lg"
                      variant="secondary"
                      isLoading={isSubmitting}
                    >
                      {t`Reset password`}
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
            )}
          </div>
          <PatternedBackground />
        </div>
      </main>
    </>
  );
}

