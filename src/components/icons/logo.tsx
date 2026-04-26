import Image from 'next/image';

export function Logo(props: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt="EVonGoLogo"
      width={160}
      height={40}
      className={props.className}
      priority
    />
  );
}
