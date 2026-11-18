type BrandLogoProps = {
  size?: 'small' | 'medium' | 'large';
  className?: string;
};

const sizes = {
  small: 'size-10',
  medium: 'size-12',
  large: 'size-24',
};

export function BrandLogo({ size = 'medium', className = '' }: BrandLogoProps) {
  return (
    <span
      className={`inline-grid shrink-0 place-items-center overflow-hidden rounded-xl bg-white ${sizes[size]} ${className}`}
    >
      <img
        src="/virtuallogo.jpeg"
        alt="Virtual Raksha Kavach logo"
        className="size-full scale-[1.12] object-contain"
      />
    </span>
  );
}
