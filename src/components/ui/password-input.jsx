import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

const PasswordInput = React.forwardRef(
  ({ className, wrapperClassName, type: _type, disabled, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false);

    const handleToggle = () => {
      setShowPassword((prev) => !prev);
    };

    return (
      <div className={cn("relative", wrapperClassName)}>
        <input
          ref={ref}
          type={showPassword ? "text" : "password"}
          disabled={disabled}
          className={cn("pr-12", className)}
          {...props}
        />
        <button
          type="button"
          onClick={handleToggle}
          disabled={disabled}
          aria-label={showPassword ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1 rounded disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-gray-500"
        >
          {showPassword ? (
            <EyeOff className="w-5 h-5" aria-hidden />
          ) : (
            <Eye className="w-5 h-5" aria-hidden />
          )}
        </button>
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
