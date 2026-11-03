namespace LupaDemo;

// A harmless fixture. Lupa.NET reads this assembly without invoking its methods.
public static class Calculator
{
    public static int Add(int first, int second) => first + second;
    public static string Describe(int value)
    {
        if (value < 0) return "The value is negative";
        if (value == 0) return "The value is zero";
        return "The value is positive";
    }
    public static string Message() => "Hello! This assembly is a harmless static analysis example.";
}
