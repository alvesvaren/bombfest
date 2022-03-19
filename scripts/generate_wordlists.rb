#!/usr/bin/ruby
# frozen_string_literal: true

require 'open3'

allowed_wordlists = %w[sv en fr sp no es gr ca it nl nb nn da de]
output, = Open3.capture3('aspell dump dicts')
# @type [String]

output.lines.each do |lang|
  lang = lang.strip
  next unless allowed_wordlists.include?(lang)
  next unless lang.length == 2

  puts "Finding word roots for #{lang}"
  Dir.mkdir("./wordlists/#{lang}") unless Dir.exist?("./wordlists/#{lang}")

  output, = Open3.capture3("aspell -d #{lang} dump master")
  output = output.lines.map { |word| word.chomp.split('/')[0] }.filter { |word| word.downcase == word }.uniq
  File.write("./wordlists/#{lang}/roots.txt", output.join("\n"))
end
