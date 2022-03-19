#!/usr/bin/ruby
# frozen_string_literal: true

prompts = Hash.new(0)
letter_regex = /^[a-zåäö]+$/

Dir.glob('./wordlists/*/').each do |lang|
  lang = lang.split('/')[2]
  puts "Finding prompts for #{lang}"
  File.readlines("./wordlists/#{lang}/roots.txt").each do |word|
    # @type [String]
    word = word.to_s.strip

    # Check if word only contains letters
    next unless word =~ letter_regex

    chars = word.chars
    parts = []
    parts << chars.each_slice(2)
    parts << chars.each_slice(3)
    parts << chars.drop(1).each_slice(2)
    parts << chars.drop(1).each_slice(3)
    parts << chars.drop(2).each_slice(3)

    Enumerator::Chain.new(*parts).each do |slice|
      # @type [String]
      slice = slice.join

      # Check if slice is a valid word
      next unless [2, 3].include?(slice.length)

      # Add slice to prompts hash
      prompts[slice] += 1
    end
  end

  File.open("./wordlists/#{lang}/prompts.txt", 'w') do |file|
    prompts.each do |key, value|
      file.puts "#{key}:#{value}"
    end
  end
end
