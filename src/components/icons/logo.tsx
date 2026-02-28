import Image from 'next/image';

export function Logo(props: { className?: string }) {
  return (
    <Image
      src="https://i.ibb.co/WWWkDvDt/Gemini-Generated-Image-tww1nrtww1nrtww1.png"
      alt="EVonGoLogo"
      width={160}
      height={40}
      className={props.className}
      priority
    />
  );
}
