'use client';

import Link from 'next/link';
import { useActionState, useEffect } from 'react';
import { GithubIcon, GoogleIcon } from '~/app/_common/components/icons';
import { Logo } from '~/app/_common/components/logo';
import { Button } from '~/app/_core/components/button';
import { Input } from '~/app/_core/components/input';
import { Label } from '~/app/_core/components/label';
import { trackAuthEvent } from '~/app/_common/utils/analytics';
import { loginUser } from '../_actions/login-user.action';
import { useOAuth } from '../_hooks/use-oauth';

export default function LoginPage() {
  const { googleLogin, githubLogin } = useOAuth();
  const [state, formAction, isPending] = useActionState(loginUser, null);

  useEffect(() => {
    trackAuthEvent.loginStart();
  }, []);

  return (
    <section className='flex w-full bg-background dark:bg-transparent md:px-4 md:py-32'>
      <form action={formAction} className='max-w-92 m-auto h-fit w-full'>
        <div className='p-6'>
          <div className='flex flex-col'>
            <Logo />
            <h1 className='mb-1 mt-4 text-xl font-semibold'>Sign In to Bookmarket</h1>
            <p>Welcome back! Sign in to continue</p>
          </div>

          <div className='mt-6 grid grid-cols-2 gap-3'>
            <Button type='button' variant='outline' onClick={() => {
              trackAuthEvent.oauthGoogle();
              googleLogin();
            }}>
              <GoogleIcon />
              <span>Google</span>
            </Button>
            <Button type='button' variant='outline' onClick={() => {
              trackAuthEvent.oauthGithub();
              githubLogin();
            }}>
              <GithubIcon />
              <span>Github</span>
            </Button>
          </div>

          <div className='my-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3'>
            <hr className='border-dashed' />
            <span className='text-xs text-muted-foreground'>Or continue with</span>
            <hr className='border-dashed' />
          </div>

          <div className='space-y-6'>
            {state?.error && (
              <div className='rounded-md bg-red-50 p-4 text-sm text-red-800 border border-red-200'>
                {state.error}
              </div>
            )}
            
            <div className='space-y-2'>
              <Label htmlFor='email' className='block text-sm'>
                Email
              </Label>
              <Input type='email' required name='email' id='email' />
            </div>

            <div className='space-y-2'>
              <div className='flex items-center justify-between'>
                <Label htmlFor='password' className='text-title text-sm'>
                  Password
                </Label>
              </div>
              <Input type='password' required name='password' id='password' className='input sz-md variant-mixed' />
            </div>

            <Button className='w-full' type='submit' disabled={isPending}>
              Sign In
            </Button>
          </div>
        </div>

        <p className='text-center text-sm text-accent-foreground'>
          {"Don't have an account? "}
          <Button asChild variant='link' className='px-2'>
            <Link href='/signup'>Create account</Link>
          </Button>
        </p>
      </form>
    </section>
  );
}
